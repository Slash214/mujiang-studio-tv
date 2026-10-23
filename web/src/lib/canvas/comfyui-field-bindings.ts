import type { ComfyUILocalConfig, RunningHubWorkflow, WorkflowFieldMapping, WorkflowUsageSlot } from "@/stores/use-config-store";
import { normalizePersistedUsageSlot } from "@/stores/use-config-store";
import { capabilityFromUsageSlot } from "@/lib/canvas/workflow-usage-slot";

function isNegativePromptName(name: string) {
    return /negative|neg[_ -]?prompt|负面|反向|负向/i.test(name);
}

function norm(value: unknown) {
    return String(value || "")
        .toLowerCase()
        .replace(/[\s_-]/g, "");
}

function pickPromptField(fields: WorkflowFieldMapping[]) {
    return (
        fields.find((field) => field.classType === "MiniMaxH3Director" && field.fieldName === "global_prompt")
        || fields.find((field) => /textencode/i.test(String(field.classType || "")) && norm(field.fieldName) === "prompt" && !isNegativePromptName(String(field.fieldName || "")))
        || fields.find((field) => norm(field.fieldName) === "prompt" && !isNegativePromptName(String(field.fieldName || "")))
        || fields.find((field) => norm(field.fieldName) === "globalprompt")
    );
}

function shouldDisableNoisyField(field: WorkflowFieldMapping) {
    const classType = String(field.classType || "");
    const fieldName = String(field.fieldName || "");
    if (/^(CreateVideo|SaveVideo|SaveImage)$/i.test(classType)) return true;
    if (fieldName === "timeline_data" || fieldName === "task_type" || fieldName === "minimax_director_ui") return true;
    return false;
}

/** 为本机 ComfyUI 工作流补齐画布可用的提示词/参考图映射；有改动时返回新 config。 */
export function ensureComfyUIWorkflowFieldBindings(comfyUI: ComfyUILocalConfig): { config: ComfyUILocalConfig; changed: boolean; report: Array<{ id: string; slot: string; prompt?: string; refImages: number }> } {
    let changed = false;
    const report: Array<{ id: string; slot: string; prompt?: string; refImages: number }> = [];
    const workflows = (comfyUI.workflows || []).map((workflow) => {
        const slot = normalizePersistedUsageSlot(workflow.usageSlot, workflow.capability || "image") || "image_t2i";
        const fields = Array.isArray(workflow.fields) ? workflow.fields.map((field) => ({ ...field })) : [];
        if (!fields.length) {
            report.push({ id: workflow.workflowId, slot, refImages: 0 });
            return workflow;
        }

        let localChanged = false;
        const mark = <T extends WorkflowFieldMapping>(field: T, patch: Partial<WorkflowFieldMapping>) => {
            for (const [key, value] of Object.entries(patch)) {
                if ((field as Record<string, unknown>)[key] !== value) {
                    (field as Record<string, unknown>)[key] = value;
                    localChanged = true;
                }
            }
        };

        for (const field of fields) {
            if (field.source === "prompt" || field.source === "referenceImage" || field.source === "referenceVideo" || field.source === "referenceAudio" || field.source === "mask") {
                // 下面会重建业务映射；先清掉旧的自动/手工业务 source，避免重复。
                mark(field, { source: "", sourceAutomatic: false });
            }
            if (shouldDisableNoisyField(field) && !field.source) {
                mark(field, { enabled: false, role: field.role || "internal" });
            }
        }

        const promptField = pickPromptField(fields);
        if (promptField) {
            mark(promptField, {
                source: "prompt",
                sourceAutomatic: true,
                enabled: true,
                role: "prompt",
                required: true,
            });
        }

        const hasH3Director = fields.some((field) => /minimaxh3director/i.test(String(field.classType || "")));
        // H3 Director 通过 timeline_data 吃参考图，不依赖 LoadImage；有 Director 时不要为槽位强绑 LoadImage。
        if (!hasH3Director && (slot === "image_edit" || slot === "image_ref" || slot.startsWith("video_"))) {
            const loadImages = fields.filter((field) => /LoadImage/i.test(String(field.classType || "")) && norm(field.fieldName) === "image");
            loadImages.forEach((field, index) => {
                mark(field, {
                    source: "referenceImage",
                    sourceAutomatic: true,
                    enabled: true,
                    role: "media",
                    imageOrder: index + 1,
                    sourceIndex: index,
                });
            });
        }

        if (slot === "video_v2v" || slot === "video_rv2v") {
            const loadVideos = fields.filter((field) => /LoadVideo|VHS_LoadVideo/i.test(String(field.classType || "")) && /video|file|path/i.test(String(field.fieldName || "")));
            loadVideos.forEach((field, index) => {
                mark(field, {
                    source: "referenceVideo",
                    sourceAutomatic: true,
                    enabled: true,
                    role: "media",
                    sourceIndex: index,
                });
            });
        }

        for (const field of fields) {
            if (norm(field.fieldName) === "seed" || norm(field.fieldName) === "noiseseed") {
                mark(field, { enabled: true, randomEnabled: true });
            }
        }

        report.push({
            id: workflow.workflowId,
            slot,
            prompt: promptField ? `${promptField.classType || ""}.${promptField.fieldName}` : undefined,
            refImages: fields.filter((field) => field.source === "referenceImage").length,
        });

        if (!localChanged) return workflow;
        changed = true;
        const next: RunningHubWorkflow = {
            ...workflow,
            usageSlot: slot as WorkflowUsageSlot,
            capability: capabilityFromUsageSlot(slot),
            fields,
        };
        return next;
    });

    if (!changed) return { config: comfyUI, changed: false, report };
    return {
        config: { ...comfyUI, workflows },
        changed: true,
        report,
    };
}
