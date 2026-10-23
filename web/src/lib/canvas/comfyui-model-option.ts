import type { AiConfig, ModelCapability, RunningHubCapability, RunningHubWorkflow } from "@/stores/use-config-store";
import { normalizePersistedUsageSlot, normalizeRunningHubCapability } from "@/stores/use-config-store";
import { capabilityFromUsageSlot, workflowUsageSlotLabel } from "@/lib/canvas/workflow-usage-slot";

/** 画布模型下拉里本机 ComfyUI 工作流的合成选项前缀。 */
export const COMFYUI_MODEL_OPTION_PREFIX = "comfyui::";

export type ComfyUIModelOption = {
    value: string;
    workflowId: string;
    label: string;
    capability: ModelCapability;
};

export function encodeComfyUIModelOption(workflowId: string) {
    const id = String(workflowId || "").trim();
    return id ? `${COMFYUI_MODEL_OPTION_PREFIX}${id}` : "";
}

export function parseComfyUIModelOption(value: string | undefined): string | undefined {
    const raw = String(value || "").trim();
    if (!raw.startsWith(COMFYUI_MODEL_OPTION_PREFIX)) return undefined;
    const workflowId = raw.slice(COMFYUI_MODEL_OPTION_PREFIX.length).trim();
    return workflowId || undefined;
}

export function isComfyUIModelOption(value: string | undefined) {
    return Boolean(parseComfyUIModelOption(value));
}

function workflowCapability(workflow: RunningHubWorkflow, fallback: RunningHubCapability = "image"): RunningHubCapability {
    const slot = normalizePersistedUsageSlot(workflow.usageSlot, workflow.capability || fallback);
    if (slot) return capabilityFromUsageSlot(slot);
    return normalizeRunningHubCapability(workflow.capability, fallback);
}

export function comfyUIModelOptionLabel(config: AiConfig, value: string) {
    const workflowId = parseComfyUIModelOption(value);
    if (!workflowId) return "";
    const workflow = config.comfyUI.workflows.find((item) => item.workflowId.trim() === workflowId);
    if (!workflow) return workflowId;
    const title = workflow.title?.trim() || workflowId;
    const slot = normalizePersistedUsageSlot(workflow.usageSlot, workflow.capability || "image");
    const slotLabel = slot ? workflowUsageSlotLabel(slot) : "";
    return slotLabel ? `${title} · ${slotLabel}` : title;
}

/** 已启用本机 ComfyUI 时，按能力列出可在模型下拉中选择的工作流。 */
export function listComfyUIModelOptions(config: AiConfig, capability?: ModelCapability): ComfyUIModelOption[] {
    if (!config.comfyUI?.enabled || !config.comfyUI.baseUrl?.trim()) return [];
    return (config.comfyUI.workflows || [])
        .filter((item) => item.workflowId?.trim() && item.workflowJson && Object.keys(item.workflowJson).length)
        .map((item) => {
            const workflowId = item.workflowId.trim();
            const itemCapability = workflowCapability(item);
            return {
                value: encodeComfyUIModelOption(workflowId),
                workflowId,
                label: comfyUIModelOptionLabel(config, encodeComfyUIModelOption(workflowId)),
                capability: itemCapability,
            };
        })
        .filter((item) => !capability || item.capability === capability);
}

export function defaultComfyUIModelOption(config: AiConfig, capability: ModelCapability): string {
    const options = listComfyUIModelOptions(config, capability);
    if (!options.length) return "";
    const defaults = config.comfyUI.defaultWorkflows || {};
    const preferredSlot = capability === "video" ? "video_t2v" : capability === "image" ? "image_t2i" : undefined;
    if (preferredSlot) {
        const defaultId = String(defaults[preferredSlot] || "").trim();
        const match = options.find((item) => item.workflowId === defaultId);
        if (match) return match.value;
    }
    return options[0]?.value || "";
}
