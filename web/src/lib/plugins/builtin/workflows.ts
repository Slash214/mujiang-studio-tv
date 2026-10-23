import { registerPlugin } from "../plugin-registry";
import { PLUGIN_API_VERSION, type PluginManifest, type RegisteredPlugin } from "../plugin-types";

export const RUNNINGHUB_PLUGIN_ID = "runninghub-workflow-provider";
export const COMFYUI_LOCAL_PLUGIN_ID = "comfyui-local-provider";

export type WorkflowProvider = "runninghub" | "comfyui";

export function workflowPluginId(provider: WorkflowProvider) {
    return provider === "comfyui" ? COMFYUI_LOCAL_PLUGIN_ID : RUNNINGHUB_PLUGIN_ID;
}

export function workflowProviderPluginEnabled(statuses: Record<string, string>, provider: WorkflowProvider) {
    if (provider === "comfyui") {
        // 本地桌面后端默认放行本机 ComfyUI；前端状态缺失时也允许进入配置态。
        return statuses[COMFYUI_LOCAL_PLUGIN_ID] !== "disabled";
    }
    return statuses[workflowPluginId(provider)] === "enabled";
}

function workflowContributions(providerId: string, label: string) {
    return (["image", "video", "audio"] as const).map((capability) => ({
        id: `${providerId}-${capability}`,
        label: `${label} · ${{ image: "图片", video: "视频", audio: "音频" }[capability]}`,
        providerId,
        capability,
        parameters: [],
    }));
}

const runningHubManifest: PluginManifest = {
    id: RUNNINGHUB_PLUGIN_ID,
    name: "RunningHub 工作流",
    version: "1.0.0",
    publishedAt: "2026-08-25",
    updatedAt: "2026-08-25",
    apiVersion: PLUGIN_API_VERSION,
    description: "在画布中拉取并执行 RunningHub Workflow 与 App，按工作流字段生成图片、视频和音频。",
    documentation:
        "# RunningHub 工作流\n\n该插件把 RunningHub 的 Workflow / App 接入画布工作流节点。API Key、工作流参数和字段映射仍由宿主安全保存并提交，插件本身不接触密钥。\n\n在插件设置中可以打开完整的 RunningHub 配置页，拉取工作流、编辑字段映射并测试请求。",
    author: "内置工作流",
    surfaces: ["node", "settings"],
    permissions: ["generation.run", "external.open"],
    trusted: true,
    runtime: { backend: "trusted-backend", web: "trusted-backend" },
    contributes: { workflows: workflowContributions(RUNNINGHUB_PLUGIN_ID, "RunningHub") },
};

const comfyUILocalManifest: PluginManifest = {
    id: COMFYUI_LOCAL_PLUGIN_ID,
    name: "本机 ComfyUI",
    version: "1.0.0",
    publishedAt: "2026-09-27",
    updatedAt: "2026-09-27",
    apiVersion: PLUGIN_API_VERSION,
    description: "连接本机 ComfyUI（默认 127.0.0.1:8188），导入 API 格式工作流用于出图与出视频。",
    documentation:
        "# 本机 ComfyUI\n\n在设置中填写 Base URL，粘贴 ComfyUI「Save (API Format)」导出的工作流 JSON，并映射提示词字段。画布节点选择「本机 ComfyUI」后即可提交到 `/prompt` 并轮询 `/history`。",
    author: "本地二开",
    surfaces: ["node", "settings"],
    permissions: ["generation.run", "external.open"],
    trusted: true,
    runtime: { backend: "trusted-backend", web: "trusted-backend" },
    contributes: { workflows: workflowContributions(COMFYUI_LOCAL_PLUGIN_ID, "本机 ComfyUI").filter((item) => item.capability !== "audio") },
};

registerPlugin({ manifest: runningHubManifest } satisfies RegisteredPlugin);
registerPlugin({ manifest: comfyUILocalManifest } satisfies RegisteredPlugin);
