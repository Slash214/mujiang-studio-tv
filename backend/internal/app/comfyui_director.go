package app

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"infinite-canvas/backend/internal/provider/workflow"
)

func workflowContainsMiniMaxH3Director(graph map[string]interface{}) bool {
	for _, raw := range graph {
		node, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		if isMiniMaxH3DirectorNode(fmt.Sprint(node["class_type"])) {
			return true
		}
	}
	return false
}

// applyComfyUIDirectorCanvasInputs 把画布提示词/参考媒体写入 MiniMax H3 Director 的
// global_prompt 与 timeline_data。该插件不走独立 LoadImage 节点，素材在时间轴 JSON 内。
func applyComfyUIDirectorCanvasInputs(graph map[string]interface{}, files map[string]string, input canvasGenerationInput) {
	if len(graph) == 0 {
		return
	}
	imageNames := comfyUIUploadedNames(files, input.ReferenceImages)
	videoNames := comfyUIUploadedNames(files, input.ReferenceVideos)
	audioNames := comfyUIUploadedNames(files, input.ReferenceAudios)
	prompt := strings.TrimSpace(input.Prompt)
	nodeIDs := make([]string, 0, len(graph))
	for nodeID := range graph {
		nodeIDs = append(nodeIDs, nodeID)
	}
	sort.Slice(nodeIDs, func(i, j int) bool { return workflow.NodeIDLess(nodeIDs[i], nodeIDs[j]) })
	for _, nodeID := range nodeIDs {
		node, ok := graph[nodeID].(map[string]interface{})
		if !ok {
			continue
		}
		classType := strings.TrimSpace(fmt.Sprint(node["class_type"]))
		if !isMiniMaxH3DirectorNode(classType) {
			continue
		}
		inputs, ok := node["inputs"].(map[string]interface{})
		if !ok || inputs == nil {
			inputs = map[string]interface{}{}
			node["inputs"] = inputs
		}
		taskType := normalizeH3DirectorTaskType(fmt.Sprint(inputs["task_type"]))
		if prompt != "" {
			inputs["global_prompt"] = prompt
		}
		rawTimeline := strings.TrimSpace(fmt.Sprint(inputs["timeline_data"]))
		if rawTimeline == "" || rawTimeline == "<nil>" {
			continue
		}
		var timeline map[string]any
		if err := json.Unmarshal([]byte(rawTimeline), &timeline); err != nil || timeline == nil {
			continue
		}
		injectH3DirectorTimeline(timeline, taskType, prompt, imageNames, videoNames, audioNames)
		encoded, err := json.Marshal(timeline)
		if err != nil {
			continue
		}
		inputs["timeline_data"] = string(encoded)
	}
}

func isMiniMaxH3DirectorNode(classType string) bool {
	normalized := strings.ToLower(strings.TrimSpace(classType))
	return normalized == "minimaxh3director"
}

func normalizeH3DirectorTaskType(raw string) string {
	lower := strings.ToLower(strings.TrimSpace(raw))
	for _, code := range []string{"rv2v", "fl2v", "r2v", "i2v", "v2v", "t2v"} {
		if strings.HasPrefix(lower, code) || strings.Contains(lower, " "+code+" ") || strings.Contains(lower, "—"+code) || strings.Contains(lower, "-"+code) {
			return code
		}
		if strings.Contains(lower, code+" ") || strings.Contains(lower, code+"—") || strings.Contains(lower, code+"-") {
			return code
		}
	}
	switch {
	case strings.Contains(lower, "reference") && strings.Contains(lower, "video") && strings.Contains(lower, "edit"):
		return "rv2v"
	case strings.Contains(lower, "first") && strings.Contains(lower, "last"):
		return "fl2v"
	case strings.Contains(lower, "reference"):
		return "r2v"
	case strings.Contains(lower, "image to video") || strings.Contains(lower, "图生视频"):
		return "i2v"
	case strings.Contains(lower, "video to video") || strings.Contains(lower, "视频转视频"):
		return "v2v"
	case strings.Contains(lower, "text to video") || strings.Contains(lower, "文生视频"):
		return "t2v"
	default:
		return ""
	}
}

func comfyUIUploadedNames(files map[string]string, media []providerMedia) []string {
	names := make([]string, 0, len(media))
	for _, item := range media {
		name := strings.TrimSpace(files[item.ID])
		if name == "" {
			continue
		}
		names = append(names, name)
	}
	return names
}

func injectH3DirectorTimeline(timeline map[string]any, taskType string, prompt string, images []string, videos []string, audios []string) {
	if global, ok := timeline["global"].(map[string]any); ok {
		if prompt != "" {
			global["prompt"] = prompt
		}
		if len(images) > 0 {
			switch taskType {
			case "i2v", "fl2v":
				global["genImage"] = map[string]any{"imageFile": images[0], "fileName": images[0]}
			case "r2v", "rv2v":
				global["refs"] = h3DirectorImageRefs(images)
			}
		}
		if len(videos) > 0 && (taskType == "v2v" || taskType == "rv2v") {
			global["referenceVideo"] = map[string]any{"videoFile": videos[0], "fileName": videos[0], "type": "input", "subfolder": ""}
		}
		if len(audios) > 0 {
			global["refAudios"] = h3DirectorAudioRefs(audios)
		}
	}
	if video, ok := timeline["video"].(map[string]any); ok && len(videos) > 0 && (taskType == "v2v" || taskType == "rv2v") {
		video["videoFile"] = videos[0]
		video["fileName"] = videos[0]
		video["type"] = "input"
		if _, exists := video["subfolder"]; !exists {
			video["subfolder"] = ""
		}
	}
	if segments, ok := timeline["segments"].([]any); ok && len(segments) > 0 {
		for index, raw := range segments {
			segment, ok := raw.(map[string]any)
			if !ok {
				continue
			}
			if prompt != "" && (index == 0 || strings.TrimSpace(fmt.Sprint(segment["prompt"])) == "") {
				segment["prompt"] = prompt
			}
			switch taskType {
			case "i2v":
				if index == 0 && len(images) > 0 {
					segment["genImage"] = map[string]any{"imageFile": images[0], "fileName": images[0]}
				}
			case "fl2v":
				if index == 0 {
					if len(images) > 0 {
						segment["startImage"] = map[string]any{"imageFile": images[0], "fileName": images[0]}
						segment["genImage"] = map[string]any{"imageFile": images[0], "fileName": images[0]}
					}
					if len(images) > 1 {
						segment["endImage"] = map[string]any{"imageFile": images[1], "fileName": images[1]}
					}
				}
			case "r2v", "rv2v":
				if len(images) > 0 {
					segment["refs"] = h3DirectorImageRefs(images)
				}
				if len(videos) > 0 && taskType == "rv2v" {
					segment["refVideos"] = h3DirectorVideoRefs(videos)
				}
				if len(audios) > 0 {
					segment["refAudios"] = h3DirectorAudioRefs(audios)
				}
			case "v2v":
				if len(videos) > 0 {
					segment["refVideos"] = h3DirectorVideoRefs(videos)
				}
			}
		}
	}
	if keyframes, ok := timeline["keyframes"].([]any); ok && len(keyframes) > 0 && len(images) > 0 {
		for index, raw := range keyframes {
			frame, ok := raw.(map[string]any)
			if !ok {
				continue
			}
			imageName := images[0]
			if index < len(images) {
				imageName = images[index]
			}
			frame["imageFile"] = imageName
			if prompt != "" && index == 0 {
				frame["prompt"] = prompt
			}
		}
	}
}

func h3DirectorImageRefs(names []string) []any {
	refs := make([]any, 0, len(names))
	for _, name := range names {
		refs = append(refs, map[string]any{"imageFile": name, "fileName": name, "type": "input", "subfolder": ""})
	}
	return refs
}

func h3DirectorVideoRefs(names []string) []any {
	refs := make([]any, 0, len(names))
	for _, name := range names {
		refs = append(refs, map[string]any{"videoFile": name, "fileName": name, "type": "input", "subfolder": ""})
	}
	return refs
}

func h3DirectorAudioRefs(names []string) []any {
	refs := make([]any, 0, len(names))
	for _, name := range names {
		refs = append(refs, map[string]any{"audioFile": name, "fileName": name, "type": "input", "subfolder": ""})
	}
	return refs
}
