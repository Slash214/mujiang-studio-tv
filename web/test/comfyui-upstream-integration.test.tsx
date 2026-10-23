import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ModelPicker } from "@/components/model-picker";
import { buildGenerationConfig } from "@/lib/canvas/canvas-project-generation";
import { encodeComfyUIModelOption } from "@/lib/canvas/comfyui-model-option";
import { createModelChannel, defaultConfig, normalizeConfigSnapshot, type AiConfig } from "@/stores/use-config-store";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

function configFixture(): AiConfig {
    return {
        ...structuredClone(defaultConfig),
        comfyUI: {
            enabled: true,
            baseUrl: "http://127.0.0.1:8188",
            capability: "image",
            workflowId: "local-image",
            workflows: [{ workflowId: "local-image", title: "Local image workflow", capability: "image", usageSlot: "image_t2i", workflowJson: { "1": { class_type: "SaveImage", inputs: {} } } }],
            defaultWorkflows: { image_t2i: "local-image" },
        },
    };
}

const node: CanvasNodeData = { id: "image-1", type: CanvasNodeType.Image, title: "Image", position: { x: 0, y: 0 }, width: 320, height: 320, metadata: {} };

test("ComfyUI remains selectable when the upstream channel catalog is empty", () => {
    const config = configFixture();
    const markup = renderToStaticMarkup(<ModelPicker config={config} value={encodeComfyUIModelOption("local-image")} capability="image" onChange={() => {}} />);
    expect(markup).toContain("Local image workflow");
    expect(markup).toContain("本机 ComfyUI");
    const generation = buildGenerationConfig(config, node, "image");
    expect(generation.taskWorkflowProvider).toBe("comfyui");
    expect(generation.comfyUI.workflowId).toBe("local-image");
});

test("an explicit channel selection is preserved alongside local workflows", () => {
    const config = configFixture();
    config.channels = [createModelChannel({ id: "custom", name: "Custom", baseUrl: "https://example.com", apiKey: "test-only", models: ["gpt-image-1"] })];
    const generation = buildGenerationConfig(config, { ...node, metadata: { model: "gpt-image-1", workflowProvider: "model" } }, "image");
    expect(generation.taskWorkflowProvider).toBe("model");
    expect(generation.comfyUI.enabled).toBe(false);
});

test("configuration restore retains ComfyUI workflows and upstream video switch normalization", () => {
    const config = configFixture();
    const restored = normalizeConfigSnapshot({ config: { ...config, videoGenerateAudio: false as never } });
    expect(restored.config.comfyUI).toMatchObject(config.comfyUI);
    expect(restored.config.videoGenerateAudio).toBe("false");
});
