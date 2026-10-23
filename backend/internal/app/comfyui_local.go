package app

// 本机 ComfyUI（原生 /prompt + /history + /view）工作流执行。
// 复用 RunningHub 的字段映射合同，但出站协议改为 ComfyUI HTTP API。

import (
	"bytes"
	"context"
	cryptorand "crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"mime/multipart"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"infinite-canvas/backend/internal/provider/workflow"
)

func isComfyUILocalInterface(value string) bool {
	pluginID, ok := workflowPluginIDForInterface(strings.ToLower(strings.TrimSpace(value)))
	return ok && pluginID == WorkflowPluginComfyUILocal
}

func comfyUILocalRootURL(baseURL string) string {
	trimmed := strings.TrimSpace(baseURL)
	if trimmed == "" {
		return "http://127.0.0.1:8188"
	}
	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return strings.TrimRight(trimmed, "/")
	}
	parsed.Path = ""
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return strings.TrimRight(parsed.String(), "/")
}

func (s *Service) runComfyUILocalWorkflow(ctx context.Context, input canvasGenerationInput) (map[string]interface{}, error) {
	root := comfyUILocalRootURL(input.Config.BaseURL)
	if _, err := ValidateOutboundURL(root); err != nil {
		return nil, fmt.Errorf("本机 ComfyUI Base URL 不可用：%w", err)
	}
	if resumed := resumedProviderRequestID(ctx); resumed != "" {
		return s.pollComfyUILocalWorkflow(ctx, input.Config, root, resumed, input.Mode)
	}
	graph := cloneWorkflowJSON(input.Config.WorkflowJSON)
	if len(graph) == 0 {
		return nil, errors.New("本机 ComfyUI 缺少 workflowJson（请导入 API 格式工作流）")
	}
	workflowFields := input.Config.WorkflowFields
	if len(workflowFields) == 0 {
		var inferErr error
		workflowFields, inferErr = workflow.FieldsFromManagement(graph, input.Mode)
		if inferErr != nil {
			return nil, inferErr
		}
	}
	workflowFields = workflow.FieldsForMode(workflowFields, input.Mode)
	// MiniMax H3 Director 把参考图/视频写进 timeline_data，不依赖 LoadImage 字段槽位；
	// 若仍按 RunningHub 槽位校验，图生视频会误报「配置了 0 个参考图片槽位」。
	if err := validateComfyUILocalMediaInputs(workflowFields, graph, input); err != nil {
		return nil, err
	}
	files := map[string]string{}
	for _, media := range append(append(append([]providerMedia{}, input.ReferenceImages...), input.ReferenceVideos...), input.ReferenceAudios...) {
		name, err := s.uploadComfyUILocalMedia(ctx, root, input.Config, media)
		if err != nil {
			return nil, err
		}
		files[media.ID] = name
	}
	if input.Mask != nil {
		name, err := s.uploadComfyUILocalMedia(ctx, root, input.Config, *input.Mask)
		if err != nil {
			return nil, err
		}
		files[input.Mask.ID] = name
	}
	canvasInput := s.workflowInputFromCanvas(ctx, input)
	nodeInfo, err := workflow.NodeInfo(workflowFields, files, canvasInput, graph)
	if err != nil {
		return nil, err
	}
	if !workflow.FieldsBindPrompt(workflowFields) {
		nodeInfo = workflow.UpsertNodeInfo(nodeInfo, workflow.PromptFallback(graph, input.Prompt))
	}
	if err := applyComfyUILocalNodeOverrides(graph, nodeInfo); err != nil {
		return nil, err
	}
	applyComfyUIDirectorCanvasInputs(graph, files, input)
	clientID := newComfyUILocalClientID()
	var submitted map[string]any
	if err := s.comfyUILocalJSON(ctx, input.Config, http.MethodPost, root+"/prompt", map[string]any{
		"prompt":    graph,
		"client_id": clientID,
	}, &submitted); err != nil {
		return nil, fmt.Errorf("ComfyUI 提交失败：%w", err)
	}
	if errMessage := strings.TrimSpace(fmt.Sprint(submitted["error"])); errMessage != "" && errMessage != "<nil>" {
		return nil, fmt.Errorf("ComfyUI 提交失败：%s", errMessage)
	}
	if nodeErrors, ok := submitted["node_errors"].(map[string]any); ok && len(nodeErrors) > 0 {
		encoded, _ := json.Marshal(nodeErrors)
		return nil, fmt.Errorf("ComfyUI 节点错误：%s", string(encoded))
	}
	promptID := strings.TrimSpace(fmt.Sprint(submitted["prompt_id"]))
	if promptID == "" {
		return nil, errors.New("ComfyUI 未返回 prompt_id")
	}
	if err := s.recordWorkflowProviderRequest(ctx, promptID, "submitted", nil); err != nil {
		metadata, _ := ctx.Value(providerAnalyticsKey{}).(providerAnalyticsContext)
		_ = s.log(metadata.UserID, metadata.TaskID, "error", "ComfyUI 请求状态保存失败", promptID+"："+err.Error())
	}
	return s.pollComfyUILocalWorkflow(ctx, input.Config, root, promptID, input.Mode)
}

func (s *Service) pollComfyUILocalWorkflow(ctx context.Context, config providerConfig, root string, promptID string, mode string) (map[string]interface{}, error) {
	for deadline := providerPollingDeadline(ctx); time.Now().Before(deadline); {
		var history map[string]any
		if err := s.comfyUILocalJSON(withProviderRequestKind(ctx, "poll"), config, http.MethodGet, root+"/history/"+url.PathEscape(promptID), nil, &history); err != nil {
			return nil, fmt.Errorf("ComfyUI 查询失败：%w", err)
		}
		entry, ok := history[promptID].(map[string]any)
		if !ok || entry == nil {
			_ = s.updateWorkflowProviderState(ctx, promptID, "queued", ptr(time.Now().Add(1500*time.Millisecond)))
			if err := sleepContext(ctx, 1500*time.Millisecond); err != nil {
				return nil, err
			}
			continue
		}
		if status, _ := entry["status"].(map[string]any); status != nil {
			if completed, _ := status["completed"].(bool); !completed {
				if statusStatus := strings.ToLower(strings.TrimSpace(fmt.Sprint(status["status_str"]))); statusStatus == "error" {
					return nil, fmt.Errorf("ComfyUI 任务失败：%s", fmt.Sprint(status["messages"]))
				}
			}
		}
		urls := comfyUILocalOutputURLs(root, entry)
		if len(urls) == 0 {
			_ = s.updateWorkflowProviderState(ctx, promptID, "running", ptr(time.Now().Add(1500*time.Millisecond)))
			if err := sleepContext(ctx, 1500*time.Millisecond); err != nil {
				return nil, err
			}
			continue
		}
		_ = s.updateWorkflowProviderState(ctx, promptID, "succeeded", nil)
		if mode == "video" {
			return s.downloadWorkflowVideoOutputs(ctx, urls, promptID, defaultVideoPollPolicy())
		}
		return s.downloadWorkflowOutputs(ctx, urls)
	}
	return nil, fmt.Errorf("ComfyUI 任务超时（%s）", promptID)
}

func (s *Service) uploadComfyUILocalMedia(ctx context.Context, root string, config providerConfig, media providerMedia) (string, error) {
	raw, mimeType, err := mediaBytes(media)
	if err != nil && isPublicMediaURL(strings.TrimSpace(media.URL)) {
		raw, mimeType, err = getExternalBinary(withProviderRequestKind(ctx, "upload"), strings.TrimSpace(media.URL))
	}
	if err != nil {
		return "", err
	}
	if len(raw) == 0 {
		return "", errors.New("ComfyUI 参考素材为空")
	}
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	filename := providerMediaFilename(media, mimeType)
	part, err := writer.CreateFormFile("image", filename)
	if err != nil {
		return "", err
	}
	if _, err := part.Write(raw); err != nil {
		return "", err
	}
	_ = writer.WriteField("overwrite", "true")
	if err := writer.Close(); err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(withProviderRequestKind(ctx, "upload"), http.MethodPost, root+"/upload/image", body)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	ApplyOutboundHeaders(req, config.Headers)
	data, _, err := doBinary(req)
	if err != nil {
		return "", fmt.Errorf("ComfyUI 上传素材失败：%w", err)
	}
	var response map[string]any
	if err := json.Unmarshal(data, &response); err != nil {
		return "", err
	}
	name := strings.TrimSpace(fmt.Sprint(response["name"]))
	if name == "" {
		return "", errors.New("ComfyUI 上传未返回文件名")
	}
	return name, nil
}

func (s *Service) comfyUILocalJSON(ctx context.Context, config providerConfig, method string, endpoint string, body interface{}, target *map[string]any) error {
	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(encoded)
	}
	req, err := http.NewRequestWithContext(ctx, method, endpoint, reader)
	if err != nil {
		return err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	ApplyOutboundHeaders(req, config.Headers)
	data, _, err := doBinary(req)
	if err != nil {
		return err
	}
	if len(bytes.TrimSpace(data)) == 0 {
		*target = map[string]any{}
		return nil
	}
	if err := json.Unmarshal(data, target); err != nil {
		return err
	}
	return nil
}

func validateComfyUILocalMediaInputs(fields []WorkflowField, graph map[string]interface{}, input canvasGenerationInput) error {
	if workflowContainsMiniMaxH3Director(graph) {
		// Director 在 applyComfyUIDirectorCanvasInputs 内按 task_type 写入 timeline；
		// 不要求（也不应要求）LoadImage / LoadVideo 字段映射槽位。
		return nil
	}
	media := workflow.Input{
		ReferenceImages: workflowMediaList(input.ReferenceImages),
		ReferenceVideos: workflowMediaList(input.ReferenceVideos),
		ReferenceAudios: workflowMediaList(input.ReferenceAudios),
	}
	if input.Mask != nil {
		mask := workflowMedia(*input.Mask)
		media.Mask = &mask
	}
	return workflow.ValidateMediaInputs(fields, media)
}

func applyComfyUILocalNodeOverrides(workflow map[string]interface{}, nodeInfo []map[string]any) error {
	for _, item := range nodeInfo {
		nodeID := strings.TrimSpace(stringValue(item["nodeId"]))
		fieldName := strings.TrimSpace(stringValue(item["fieldName"]))
		if nodeID == "" || fieldName == "" {
			continue
		}
		node, ok := workflow[nodeID].(map[string]interface{})
		if !ok {
			return fmt.Errorf("ComfyUI 工作流缺少节点 %s", nodeID)
		}
		inputs, ok := node["inputs"].(map[string]interface{})
		if !ok || inputs == nil {
			inputs = map[string]interface{}{}
			node["inputs"] = inputs
		}
		value := item["fieldValue"]
		// RunningHub mappings encode scalars as strings. Native ComfyUI needs
		// the original JSON type, especially false (a nonempty string is truthy).
		if text, ok := value.(string); ok {
			switch inputs[fieldName].(type) {
			case bool:
				parsed, err := strconv.ParseBool(text)
				if err != nil {
					return fmt.Errorf("ComfyUI 字段 %s.%s 不是有效开关值", nodeID, fieldName)
				}
				value = parsed
			case float64, float32, int, int64, int32, uint64, json.Number:
				parsed, err := strconv.ParseFloat(text, 64)
				if err != nil || math.IsNaN(parsed) || math.IsInf(parsed, 0) {
					return fmt.Errorf("ComfyUI 字段 %s.%s 不是有效数字", nodeID, fieldName)
				}
				value = parsed
			}
		}
		inputs[fieldName] = value
	}
	return nil
}

func comfyUILocalOutputURLs(root string, entry map[string]any) []string {
	outputs, _ := entry["outputs"].(map[string]any)
	if outputs == nil {
		return nil
	}
	nodeIDs := make([]string, 0, len(outputs))
	for nodeID := range outputs {
		nodeIDs = append(nodeIDs, nodeID)
	}
	sort.Slice(nodeIDs, func(i, j int) bool { return workflow.NodeIDLess(nodeIDs[i], nodeIDs[j]) })
	urls := make([]string, 0)
	seen := map[string]struct{}{}
	appendURL := func(raw string) {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			return
		}
		if _, exists := seen[raw]; exists {
			return
		}
		seen[raw] = struct{}{}
		urls = append(urls, raw)
	}
	for _, nodeID := range nodeIDs {
		bucket, _ := outputs[nodeID].(map[string]any)
		if bucket == nil {
			continue
		}
		for _, key := range []string{"images", "gifs", "videos", "files"} {
			items, _ := bucket[key].([]interface{})
			for _, item := range items {
				record, _ := item.(map[string]any)
				if record == nil {
					continue
				}
				filename := stringValue(record["filename"])
				if filename == "" {
					continue
				}
				query := url.Values{}
				query.Set("filename", filename)
				query.Set("subfolder", stringValue(record["subfolder"]))
				fileType := stringValue(record["type"])
				if fileType == "" {
					fileType = "output"
				}
				query.Set("type", fileType)
				appendURL(root + "/view?" + query.Encode())
			}
		}
	}
	return urls
}

func cloneWorkflowJSON(source map[string]interface{}) map[string]interface{} {
	if len(source) == 0 {
		return map[string]interface{}{}
	}
	encoded, err := json.Marshal(source)
	if err != nil {
		return map[string]interface{}{}
	}
	var cloned map[string]interface{}
	if err := json.Unmarshal(encoded, &cloned); err != nil {
		return map[string]interface{}{}
	}
	return cloned
}

func newComfyUILocalClientID() string {
	raw := make([]byte, 8)
	if _, err := cryptorand.Read(raw); err != nil {
		return fmt.Sprintf("beeftv-%d", time.Now().UnixNano())
	}
	return "beeftv-" + hex.EncodeToString(raw)
}
