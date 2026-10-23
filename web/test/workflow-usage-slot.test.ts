import { describe, expect, test } from "bun:test";

import { pickComfyUIWorkflowForSlot, resolveWorkflowUsageSlot } from "@/lib/canvas/workflow-usage-slot";
import type { ComfyUILocalConfig, RunningHubWorkflow } from "@/stores/use-config-store";

function workflow(id: string, usageSlot: RunningHubWorkflow["usageSlot"]): RunningHubWorkflow {
    return { workflowId: id, title: id, kind: "workflow", capability: usageSlot?.startsWith("video_") ? "video" : "image", usageSlot, workflowJson: { "1": {} } };
}

describe("resolveWorkflowUsageSlot", () => {
    test("picks image slots from references and mask", () => {
        expect(resolveWorkflowUsageSlot({ mode: "image" })).toBe("image_t2i");
        expect(resolveWorkflowUsageSlot({ mode: "image", referenceImageCount: 1 })).toBe("image_ref");
        expect(resolveWorkflowUsageSlot({ mode: "image", hasMask: true, referenceImageCount: 1 })).toBe("image_edit");
    });

    test("picks H3 Director video task types", () => {
        expect(resolveWorkflowUsageSlot({ mode: "video", videoEditOperation: "t2v" })).toBe("video_t2v");
        expect(resolveWorkflowUsageSlot({ mode: "video", videoEditOperation: "i2v" })).toBe("video_i2v");
        expect(resolveWorkflowUsageSlot({ mode: "video", videoEditOperation: "fl2v" })).toBe("video_fl2v");
        expect(resolveWorkflowUsageSlot({ mode: "video", videoEditOperation: "r2v" })).toBe("video_r2v");
        expect(resolveWorkflowUsageSlot({ mode: "video", videoEditOperation: "v2v" })).toBe("video_v2v");
        expect(resolveWorkflowUsageSlot({ mode: "video", videoEditOperation: "rv2v" })).toBe("video_rv2v");
        expect(resolveWorkflowUsageSlot({ mode: "video", videoEditOperation: "reference_to_video" })).toBe("video_r2v");
    });
});

describe("pickComfyUIWorkflowForSlot", () => {
    test("prefers defaultWorkflows then tagged workflow", () => {
        const comfyUI: ComfyUILocalConfig = {
            enabled: true,
            baseUrl: "http://127.0.0.1:8188",
            capability: "image",
            workflowId: "legacy",
            workflows: [workflow("legacy", "image_t2i"), workflow("ref-a", "image_ref"), workflow("ref-b", "image_ref")],
            defaultWorkflows: { image_ref: "ref-b" },
        };
        expect(pickComfyUIWorkflowForSlot(comfyUI, "image_ref")?.workflowId).toBe("ref-b");
        expect(pickComfyUIWorkflowForSlot(comfyUI, "image_t2i")?.workflowId).toBe("legacy");
    });

    test("reads legacy video_ref default key as r2v", () => {
        const comfyUI: ComfyUILocalConfig = {
            enabled: true,
            baseUrl: "http://127.0.0.1:8188",
            capability: "video",
            workflowId: "",
            workflows: [workflow("r2v-a", "video_r2v")],
            defaultWorkflows: { video_ref: "r2v-a" } as ComfyUILocalConfig["defaultWorkflows"],
        };
        expect(pickComfyUIWorkflowForSlot(comfyUI, "video_r2v")?.workflowId).toBe("r2v-a");
    });
});
