import { expect, test } from "bun:test";
import { prepareComfyUIReferenceSlots } from "@/lib/comfyui-reference-slots";
import { mergeWorkflowFieldMappings } from "@/stores/use-config-store";

function fixture() {
    return {
        interfaceType: "comfyui-local-image",
        workflowJson: {
            "1": { class_type: "LoadImage", inputs: { image: "" } },
            "2": { class_type: "LoadImage", inputs: { image: "" } },
            "3": { class_type: "TextEncodeQwenImage21", inputs: { "images.image_1": ["1", 0], "images.image_2": ["2", 0] } },
        },
        workflowFields: [1, 2].map((n) => ({ nodeId: String(n), fieldName: "image", source: "referenceImage", imageOrder: n, required: n === 1 })),
    };
}

test("single-image edit removes unused slots without changing the saved graph", () => {
    const original = fixture();
    const payload = prepareComfyUIReferenceSlots(original, 1);
    expect(payload.workflowJson).not.toHaveProperty("2");
    expect(payload.workflowJson["3"].inputs).toEqual({ "images.image_1": ["1", 0] });
    expect(payload.workflowFields).toHaveLength(1);
    expect(original.workflowJson["3"].inputs["images.image_2"]).toEqual(["2", 0]);
    expect(prepareComfyUIReferenceSlots(original, 2).workflowFields).toHaveLength(2);
});

test("missing target, excess references and required downstream consumers fail before submission", () => {
    expect(() => prepareComfyUIReferenceSlots(fixture(), 0)).toThrow("第 1 张");
    expect(() => prepareComfyUIReferenceSlots(fixture(), 3)).toThrow("最多支持 2");
    const payload = fixture();
    payload.workflowJson["3"].class_type = "SomeRequiredImageConsumer";
    expect(() => prepareComfyUIReferenceSlots(payload, 1)).toThrow("其他节点");
});

test("existing saved-image workflows and video payloads remain unchanged", () => {
    const payload = fixture();
    payload.workflowJson["1"].inputs.image = "existing-1.png";
    payload.workflowJson["2"].inputs.image = "existing-2.png";
    expect(prepareComfyUIReferenceSlots(payload, 0)).toBe(payload);
    const video = { ...fixture(), interfaceType: "comfyui-local-video" };
    expect(prepareComfyUIReferenceSlots(video, 0)).toBe(video);
});

test("explicit native widget bindings survive configuration normalization", () => {
    const field = { nodeId: "switch", fieldName: "switch", classType: "ComfySwitchNode", fieldType: "BOOLEAN" };
    const [restored] = mergeWorkflowFieldMappings(
        [{ ...field, source: "", sourceAutomatic: false, role: "business", enabled: true }],
        [{ ...field, role: "internal", enabled: false }],
        "image",
    );
    expect(restored.role).toBe("business");
    expect(restored.enabled).toBe(true);
    expect(restored.source).toBe("");
});
