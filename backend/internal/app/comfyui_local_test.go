package app

import "testing"

func TestApplyComfyUILocalNodeOverrides(t *testing.T) {
	workflow := map[string]interface{}{
		"3": map[string]interface{}{
			"class_type": "KSampler",
			"inputs": map[string]interface{}{
				"seed": 1,
			},
		},
	}
	if err := applyComfyUILocalNodeOverrides(workflow, []map[string]any{
		{"nodeId": "3", "fieldName": "seed", "fieldValue": 42},
		{"nodeId": "3", "fieldName": "steps", "fieldValue": 20},
	}); err != nil {
		t.Fatal(err)
	}
	inputs := workflow["3"].(map[string]interface{})["inputs"].(map[string]interface{})
	if inputs["seed"] != 42 || inputs["steps"] != 20 {
		t.Fatalf("unexpected inputs: %#v", inputs)
	}
}

func TestApplyComfyUILocalNodeOverridesPreservesScalarTypes(t *testing.T) {
	graph := map[string]interface{}{
		"1": map[string]interface{}{"inputs": map[string]interface{}{"switch": true, "width": float64(1024), "prompt": "old"}},
	}
	err := applyComfyUILocalNodeOverrides(graph, []map[string]any{
		{"nodeId": "1", "fieldName": "switch", "fieldValue": "false"},
		{"nodeId": "1", "fieldName": "width", "fieldValue": "768"},
		{"nodeId": "1", "fieldName": "prompt", "fieldValue": "123"},
	})
	if err != nil {
		t.Fatal(err)
	}
	inputs := graph["1"].(map[string]interface{})["inputs"].(map[string]interface{})
	if inputs["switch"] != false || inputs["width"] != float64(768) || inputs["prompt"] != "123" {
		t.Fatalf("wrong scalar types: %#v", inputs)
	}
	for _, value := range []string{"NaN", "Infinity", "invalid"} {
		if err := applyComfyUILocalNodeOverrides(graph, []map[string]any{{"nodeId": "1", "fieldName": "width", "fieldValue": value}}); err == nil {
			t.Fatalf("accepted invalid number %q", value)
		}
	}
}

func TestComfyUILocalOutputURLs(t *testing.T) {
	entry := map[string]any{
		"outputs": map[string]any{
			"9": map[string]any{
				"images": []interface{}{
					map[string]any{"filename": "out.png", "subfolder": "", "type": "output"},
				},
			},
		},
	}
	urls := comfyUILocalOutputURLs("http://127.0.0.1:8188", entry)
	if len(urls) != 1 || urls[0] != "http://127.0.0.1:8188/view?filename=out.png&subfolder=&type=output" {
		t.Fatalf("unexpected urls: %#v", urls)
	}
}

func TestComfyUILocalRootURL(t *testing.T) {
	if got := comfyUILocalRootURL("http://127.0.0.1:8188/extra"); got != "http://127.0.0.1:8188" {
		t.Fatalf("got %q", got)
	}
	if got := comfyUILocalRootURL(""); got != "http://127.0.0.1:8188" {
		t.Fatalf("empty default got %q", got)
	}
}

func TestComfyUILocalOutputsWithOmittedMetadata(t *testing.T) {
	entry := map[string]any{"outputs": map[string]any{"1": map[string]any{
		"images": []interface{}{map[string]any{}, map[string]any{"filename": "frame.png"}},
	}}}
	urls := comfyUILocalOutputURLs("http://127.0.0.1:8188", entry)
	if len(urls) != 1 || urls[0] != "http://127.0.0.1:8188/view?filename=frame.png&subfolder=&type=output" {
		t.Fatalf("missing metadata must not become literal <nil>: %#v", urls)
	}
}

func TestIsComfyUILocalInterface(t *testing.T) {
	if !isComfyUILocalInterface("comfyui-local-image") || !isComfyUILocalInterface("comfyui-local-video") {
		t.Fatal("expected local interfaces")
	}
	if isComfyUILocalInterface("runninghub-workflow-image") {
		t.Fatal("runninghub must not match")
	}
}
