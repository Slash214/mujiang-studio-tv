package app

import (
	"encoding/json"
	"fmt"
	"testing"
)

func TestValidateComfyUILocalMediaInputsSkipsDirectorSlots(t *testing.T) {
	workflow := map[string]interface{}{
		"12": map[string]interface{}{
			"class_type": "MiniMaxH3Director",
			"inputs":     map[string]interface{}{"task_type": "i2v — 图生视频"},
		},
	}
	input := canvasGenerationInput{ReferenceImages: []providerMedia{{ID: "img-1"}}}
	if err := validateComfyUILocalMediaInputs(nil, workflow, input); err != nil {
		t.Fatalf("director workflow should accept reference images without LoadImage slots: %v", err)
	}
	if err := validateComfyUILocalMediaInputs(nil, map[string]interface{}{}, input); err == nil {
		t.Fatal("non-director workflow with no slots should reject reference images")
	}
}

func TestNormalizeH3DirectorTaskType(t *testing.T) {
	cases := map[string]string{
		"t2v — 文生视频(Text to Video)": "t2v",
		"i2v — 图生视频(Image to Video)": "i2v",
		"fl2v — 首尾帧":                 "fl2v",
		"r2v":                        "r2v",
		"v2v — 视频转视频":                "v2v",
		"rv2v — 参考改视频":               "rv2v",
	}
	for raw, want := range cases {
		if got := normalizeH3DirectorTaskType(raw); got != want {
			t.Fatalf("%q => %q, want %q", raw, got, want)
		}
	}
}

func TestApplyComfyUIDirectorCanvasInputs(t *testing.T) {
	timeline := map[string]any{
		"global":    map[string]any{"prompt": "", "genImage": map[string]any{"imageFile": ""}},
		"segments":  []any{map[string]any{"id": "seg-1", "prompt": "旧提示词", "genImage": map[string]any{"imageFile": ""}}},
		"keyframes": []any{map[string]any{"id": "kf-1", "imageFile": "old.png", "prompt": "old"}},
	}
	encoded, _ := json.Marshal(timeline)
	workflow := map[string]interface{}{
		"12": map[string]interface{}{
			"class_type": "MiniMaxH3Director",
			"inputs": map[string]interface{}{
				"task_type":     "i2v — 图生视频(Image to Video)",
				"global_prompt": "",
				"timeline_data": string(encoded),
			},
		},
	}
	files := map[string]string{"img-1": "canvas-ref.png"}
	input := canvasGenerationInput{
		Prompt:          "画布提示词",
		ReferenceImages: []providerMedia{{ID: "img-1"}},
	}
	applyComfyUIDirectorCanvasInputs(workflow, files, input)
	inputs := workflow["12"].(map[string]interface{})["inputs"].(map[string]interface{})
	if inputs["global_prompt"] != "画布提示词" {
		t.Fatalf("global_prompt=%v", inputs["global_prompt"])
	}
	var next map[string]any
	if err := json.Unmarshal([]byte(fmt.Sprint(inputs["timeline_data"])), &next); err != nil {
		t.Fatal(err)
	}
	seg := next["segments"].([]any)[0].(map[string]any)
	if seg["prompt"] != "画布提示词" {
		t.Fatalf("segment prompt=%v", seg["prompt"])
	}
	gen := seg["genImage"].(map[string]any)
	if gen["imageFile"] != "canvas-ref.png" {
		t.Fatalf("genImage=%v", gen)
	}
}
