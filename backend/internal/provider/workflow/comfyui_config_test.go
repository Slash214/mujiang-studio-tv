package workflow

import "testing"

func TestComfyUIWorkflowAdmission(t *testing.T) {
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	for _, mode := range []string{"image", "video"} {
		config := Config{InterfaceType: "comfyui-local-" + mode, BaseURL: "http://127.0.0.1:8188", WorkflowJSON: map[string]interface{}{"1": map[string]interface{}{"class_type": "SaveImage"}}}
		if !IsProviderInterface(config.InterfaceType) {
			t.Fatal("local workflow classified as ordinary cloud model")
		}
		if err := ValidateConfig(mode, config); err != nil {
			t.Fatal(err)
		}
		if err := ValidateConfig("audio", config); err == nil {
			t.Fatal("unsupported mode accepted")
		}
		config.WorkflowJSON = nil
		if err := ValidateConfig(mode, config); err == nil {
			t.Fatal("missing graph accepted")
		}
	}
}
