package app

import (
	"encoding/json"
	"os"
	"testing"

	"infinite-canvas/backend/internal/provider/workflow"
)

// Optional local acceptance consumes the sanitized frontend submission snapshots.
// No provider requests or GPU tasks are made.
func TestQwenImportedTaskParameters(t *testing.T) {
	path := os.Getenv("BEEFTV_QWEN_ACCEPTANCE_CONFIGS")
	if path == "" {
		t.Skip("local import acceptance snapshots not supplied")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var configs []providerConfig
	if err := json.Unmarshal(data, &configs); err != nil {
		t.Fatal(err)
	}
	for index, config := range configs {
		graph := cloneWorkflowJSON(config.WorkflowJSON)
		input := canvasGenerationInput{Mode: "image", Prompt: "保持角色身份；只修改指定内容", Config: config}
		files := map[string]string{}
		for ref := 0; ref < index; ref++ {
			id := string(rune('a' + ref))
			input.ReferenceImages = append(input.ReferenceImages, providerMedia{ID: id})
			files[id] = id + ".png"
		}
		if err := validateComfyUILocalMediaInputs(config.WorkflowFields, graph, input); err != nil {
			t.Fatal(err)
		}
		fields := workflow.FieldsForMode(config.WorkflowFields, "image")
		mapped, err := workflow.NodeInfo(fields, files, workflow.Input{
			Mode: "image", Prompt: input.Prompt,
			Config: workflowConfigFromProvider(config), ReferenceImages: workflowMediaList(input.ReferenceImages),
		}, graph)
		if err != nil {
			t.Fatal(err)
		}
		if err := applyComfyUILocalNodeOverrides(graph, mapped); err != nil {
			t.Fatal(err)
		}
		inputs := func(id string) map[string]interface{} {
			return graph[id].(map[string]interface{})["inputs"].(map[string]interface{})
		}
		if index == 0 {
			if inputs("459:452")["prompt"] != input.Prompt || inputs("13")["aspect_ratio"] != "9:16 (Portrait Widescreen)" || inputs("13")["megapixels"] != float64(1) {
				t.Fatalf("text-to-image bindings not applied: %#v", graph)
			}
		} else {
			if inputs("474")["prompt"] != input.Prompt || inputs("101")["image"] != "a.png" {
				t.Fatal("editing prompt or first image not bound")
			}
			if index == 1 && inputs("468")["switch"] != false {
				t.Fatal("default editing must follow image 1")
			}
			if index == 2 && (inputs("102")["image"] != "b.png" || inputs("468")["switch"] != true || inputs("456")["width"] != float64(768) || inputs("456")["height"] != float64(1344)) {
				t.Fatal("reference order or custom size lost")
			}
		}
	}
}
