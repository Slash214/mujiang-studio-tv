import { normalizeRunningHubCapability, type AiConfig, type RunningHubCapability, type RunningHubWorkflowKind, type WorkflowFieldMapping } from "@/stores/use-config-store";
import { workflowProviderPluginEnabled } from "@/lib/plugins/builtin/workflows";
import { usePluginStore } from "@/stores/use-plugin-store";

export type GenerationWorkflowMode = "text" | "image" | "video" | "audio";

export type GenerationWorkflowExecution = {
    provider: "runninghub" | "comfyui";
    kind: RunningHubWorkflowKind;
    capability: RunningHubCapability;
    interfaceType: string;
    name: string;
    taskModel: string;
    providerModel: string;
    workflowId: string;
    webappId: string;
    workflowJson: Record<string, unknown>;
    workflowFields: WorkflowFieldMapping[];
};

// 画布样式计划、任务记录和后端协议必须共用同一个工作流选择结果，避免再次回退到普通模型。
export function resolveGenerationWorkflowExecution(config: AiConfig, mode: GenerationWorkflowMode): GenerationWorkflowExecution | null {
    const workflowProvider = mode === "text" ? "model" : config.taskWorkflowProvider || "model";
    if (workflowProvider === "model") return null;

    if (workflowProvider === "runninghub") {
        if (!workflowProviderPluginEnabled(usePluginStore.getState().runtimeStatuses, "runninghub")) throw new Error("RunningHub 工作流插件未启用");
        const runningHub = config.runningHub;
        const workflowId = runningHub.workflowId.trim();
        const kind = runningHub.selectedKind === "app" ? "app" : "workflow";
        const apiKey = runningHub.apiKey;
        if (!runningHub.enabled || !runningHub.baseUrl.trim() || !apiKey.trim() || !workflowId) {
            throw new Error("RunningHub 工作流配置不完整，请填写积分 API Key 并选择已保存条目");
        }
        const workflow = runningHub.workflows.find((item) => item.workflowId.trim() === workflowId && (item.kind === "app" ? "app" : "workflow") === kind);
        if (!workflow) throw new Error("当前 RunningHub 工作流条目不存在，请重新选择已保存条目");
        const capability = normalizeRunningHubCapability(workflow.capability, normalizeRunningHubCapability(runningHub.capability));
        assertWorkflowCapability("RunningHub", capability, mode);
        const webappId = kind === "app" ? (workflow.webappId || workflow.workflowId).trim() : "";
        const name = workflow.title?.trim() || webappId || workflowId;
        return {
            provider: "runninghub",
            kind,
            capability,
            interfaceType: `runninghub-workflow-${capability}`,
            name,
            taskModel: workflowTaskModel("RunningHub · ", name),
            providerModel: workflowId,
            workflowId: kind === "workflow" ? workflowId : "",
            webappId,
            workflowJson: workflow.workflowJson || {},
            workflowFields: workflow.fields || [],
        };
    }

    if (workflowProvider === "comfyui") {
        if (!workflowProviderPluginEnabled(usePluginStore.getState().runtimeStatuses, "comfyui")) throw new Error("本机 ComfyUI 工作流插件未启用");
        const comfyUI = config.comfyUI;
        const workflowId = comfyUI.workflowId.trim();
        if (!comfyUI.enabled || !comfyUI.baseUrl.trim() || !workflowId) {
            throw new Error("本机 ComfyUI 配置不完整，请填写 Base URL 并选择已保存工作流");
        }
        const workflow = comfyUI.workflows.find((item) => item.workflowId.trim() === workflowId);
        if (!workflow) throw new Error("当前 ComfyUI 工作流条目不存在，请重新选择已保存条目");
        if (!workflow.workflowJson || !Object.keys(workflow.workflowJson).length) {
            throw new Error("当前 ComfyUI 工作流缺少 API JSON，请重新导入");
        }
        const capability = normalizeRunningHubCapability(workflow.capability, normalizeRunningHubCapability(comfyUI.capability));
        assertWorkflowCapability("本机 ComfyUI", capability, mode);
        if (capability === "audio") throw new Error("本机 ComfyUI 暂不支持音频工作流");
        const name = workflow.title?.trim() || workflowId;
        return {
            provider: "comfyui",
            kind: "workflow",
            capability,
            interfaceType: `comfyui-local-${capability}`,
            name,
            taskModel: workflowTaskModel("ComfyUI · ", name),
            providerModel: workflowId,
            workflowId,
            webappId: "",
            workflowJson: workflow.workflowJson || {},
            workflowFields: workflow.fields || [],
        };
    }

    throw new Error("未知工作流提供方");
}

function assertWorkflowCapability(providerName: string, capability: RunningHubCapability, mode: GenerationWorkflowMode) {
    if (capability === mode) return;
    const capabilityName = workflowCapabilityName(capability);
    const modeName = workflowCapabilityName(mode);
    throw new Error(`${providerName} 已保存条目的用途为${capabilityName}，当前节点是${modeName}生成，请切换匹配的工作流`);
}

function workflowCapabilityName(value: GenerationWorkflowMode) {
    if (value === "video") return "视频";
    if (value === "audio") return "音频";
    if (value === "text") return "文本";
    return "图片";
}

function workflowTaskModel(prefix: string, name: string) {
    return `${prefix}${Array.from(name)
        .slice(0, Math.max(0, 120 - prefix.length))
        .join("")}`;
}
