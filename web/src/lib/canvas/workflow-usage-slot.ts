import type { ComfyUILocalConfig, RunningHubCapability, RunningHubWorkflow, WorkflowUsageSlot } from "@/stores/use-config-store";
import { normalizePersistedUsageSlot } from "@/stores/use-config-store";
import type { CanvasGenerationMode, CanvasImageGenerationType, CanvasVideoEditOperation } from "@/types/canvas";

export type { WorkflowUsageSlot };

export const WORKFLOW_USAGE_SLOTS: WorkflowUsageSlot[] = [
    "image_t2i",
    "image_ref",
    "image_edit",
    "video_t2v",
    "video_i2v",
    "video_fl2v",
    "video_r2v",
    "video_v2v",
    "video_rv2v",
];

export const WORKFLOW_USAGE_SLOT_OPTIONS: Array<{
    value: WorkflowUsageSlot;
    label: string;
    shortLabel: string;
    capability: RunningHubCapability;
    hint: string;
    group: "image" | "video";
}> = [
    { value: "image_t2i", label: "文生图", shortLabel: "T2I", capability: "image", hint: "仅提示词出图", group: "image" },
    { value: "image_ref", label: "参考图生图", shortLabel: "Ref", capability: "image", hint: "风格/构图参考图", group: "image" },
    { value: "image_edit", label: "图片编辑", shortLabel: "Edit", capability: "image", hint: "局部重绘、遮罩编辑", group: "image" },
    { value: "video_t2v", label: "文生视频", shortLabel: "T2V", capability: "video", hint: "H3 Director · task_type=t2v", group: "video" },
    { value: "video_i2v", label: "图生视频", shortLabel: "I2V", capability: "video", hint: "H3 Director · task_type=i2v", group: "video" },
    { value: "video_fl2v", label: "首尾帧生视频", shortLabel: "FL2V", capability: "video", hint: "H3 Director · task_type=fl2v", group: "video" },
    { value: "video_r2v", label: "参考主体生视频", shortLabel: "R2V", capability: "video", hint: "H3 Director · task_type=r2v", group: "video" },
    { value: "video_v2v", label: "视频转视频", shortLabel: "V2V", capability: "video", hint: "H3 Director · task_type=v2v", group: "video" },
    { value: "video_rv2v", label: "参考改视频", shortLabel: "RV2V", capability: "video", hint: "H3 Director · task_type=rv2v", group: "video" },
];

export function workflowUsageSlotLabel(slot: WorkflowUsageSlot | string | undefined) {
    const normalized = normalizePersistedUsageSlot(slot);
    const match = WORKFLOW_USAGE_SLOT_OPTIONS.find((item) => item.value === normalized);
    return match?.label || "";
}

export function capabilityFromUsageSlot(slot: WorkflowUsageSlot | string | undefined): RunningHubCapability {
    if (typeof slot === "string" && slot.startsWith("video_")) return "video";
    if (slot === "audio" || slot === "audio_default") return "audio";
    return "image";
}

export function normalizeWorkflowUsageSlot(value: unknown, fallbackCapability: RunningHubCapability = "image"): WorkflowUsageSlot | undefined {
    return normalizePersistedUsageSlot(value, fallbackCapability);
}

export type WorkflowSlotSignals = {
    mode: CanvasGenerationMode | "image" | "video" | "audio" | "text";
    generationType?: CanvasImageGenerationType;
    videoEditOperation?: CanvasVideoEditOperation | string;
    referenceImageCount?: number;
    referenceVideoCount?: number;
    hasMask?: boolean;
};

/** 根据当前生成上下文推断应使用的工作流能力槽（含 H3 Director task_type）。 */
export function resolveWorkflowUsageSlot(signals: WorkflowSlotSignals): WorkflowUsageSlot | undefined {
    const mode = signals.mode;
    if (mode === "audio" || mode === "text") return undefined;

    if (mode === "video") {
        const operation = String(signals.videoEditOperation || "").trim().toLowerCase();
        if (operation === "t2v" || operation === "text_to_video" || operation === "audio_to_video") return "video_t2v";
        if (operation === "i2v" || operation === "image_to_video" || operation === "extend" || operation === "inpaint" || operation === "style_transfer") return "video_i2v";
        if (operation === "fl2v" || operation === "first_last_to_video" || operation === "first_last_frame") return "video_fl2v";
        if (operation === "r2v" || operation === "reference_to_video" || operation === "video_ref") return "video_r2v";
        if (operation === "v2v" || operation === "video_to_video") return "video_v2v";
        if (operation === "rv2v" || operation === "reference_video_to_video") return "video_rv2v";
        if ((signals.referenceVideoCount || 0) > 0 && (signals.referenceImageCount || 0) > 0) return "video_rv2v";
        if ((signals.referenceVideoCount || 0) > 0) return "video_v2v";
        if ((signals.referenceImageCount || 0) > 1) return "video_r2v";
        if ((signals.referenceImageCount || 0) > 0) return "video_i2v";
        return "video_t2v";
    }

    if (signals.hasMask) return "image_edit";
    if (signals.generationType === "edit" || (signals.referenceImageCount || 0) > 0) return "image_ref";
    return "image_t2i";
}

export function pickComfyUIWorkflowForSlot(
    comfyUI: Pick<ComfyUILocalConfig, "workflowId" | "workflows" | "defaultWorkflows" | "capability">,
    slot: WorkflowUsageSlot | undefined,
): RunningHubWorkflow | undefined {
    const workflows = Array.isArray(comfyUI.workflows) ? comfyUI.workflows : [];
    if (!workflows.length) return undefined;

    const capability = slot ? capabilityFromUsageSlot(slot) : normalizeCapability(comfyUI.capability);
    const defaults = comfyUI.defaultWorkflows || {};

    if (slot) {
        const defaultId = String(defaults[slot] || "").trim();
        if (defaultId) {
            const matched = workflows.find((item) => item.workflowId.trim() === defaultId);
            if (matched) return matched;
        }
        // 兼容旧 video_ref 默认键
        if (slot === "video_r2v") {
            const legacyId = String((defaults as Record<string, string>).video_ref || "").trim();
            if (legacyId) {
                const matched = workflows.find((item) => item.workflowId.trim() === legacyId);
                if (matched) return matched;
            }
        }
        const tagged = workflows.find((item) => normalizeWorkflowUsageSlot(item.usageSlot, capabilityFromUsageSlot(item.capability || capability)) === slot);
        if (tagged) return tagged;
    }

    const globalId = String(comfyUI.workflowId || "").trim();
    if (globalId) {
        const matched = workflows.find((item) => item.workflowId.trim() === globalId && capabilityFromUsageSlot(normalizeWorkflowUsageSlot(item.usageSlot, item.capability || capability) || capability) === capability);
        if (matched) return matched;
        const anyGlobal = workflows.find((item) => item.workflowId.trim() === globalId);
        if (anyGlobal && (!slot || capabilityFromUsageSlot(anyGlobal.capability || capability) === capability)) return anyGlobal;
    }

    return workflows.find((item) => capabilityFromUsageSlot(normalizeWorkflowUsageSlot(item.usageSlot, item.capability || capability) || item.capability || capability) === capability)
        || workflows.find((item) => (item.capability || capability) === capability);
}

function normalizeCapability(value: RunningHubCapability | string | undefined): RunningHubCapability {
    if (value === "video" || value === "audio") return value;
    return "image";
}

export function setComfyUIDefaultWorkflow(
    comfyUI: ComfyUILocalConfig,
    slot: WorkflowUsageSlot,
    workflowId: string,
): ComfyUILocalConfig {
    const id = workflowId.trim();
    const nextDefaults = { ...(comfyUI.defaultWorkflows || {}) } as Partial<Record<WorkflowUsageSlot, string>> & Record<string, string>;
    delete nextDefaults.video_ref;
    if (!id) {
        delete nextDefaults[slot];
    } else {
        nextDefaults[slot] = id;
    }
    return {
        ...comfyUI,
        defaultWorkflows: nextDefaults,
        workflowId: id || comfyUI.workflowId,
        capability: capabilityFromUsageSlot(slot),
    };
}
