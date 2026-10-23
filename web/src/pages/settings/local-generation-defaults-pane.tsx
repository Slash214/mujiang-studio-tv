import { App, Button, Form, Input, Popconfirm, Upload } from "antd";
import { FileJson2, Star, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Switch } from "@/components/ui/base/switch";
import { WorkflowFieldMappingEditor } from "@/components/workflow-field-mapping-editor";
import { ensureComfyUIWorkflowFieldBindings } from "@/lib/canvas/comfyui-field-bindings";
import {
    WORKFLOW_USAGE_SLOT_OPTIONS,
    capabilityFromUsageSlot,
    setComfyUIDefaultWorkflow,
    workflowUsageSlotLabel,
    type WorkflowUsageSlot,
} from "@/lib/canvas/workflow-usage-slot";
import { workflowVideoFieldsFromJson } from "@/lib/model-capabilities";
import { cn } from "@/lib/utils";
import {
    filterModelsByCapability,
    modelDisplayName,
    normalizePersistedUsageSlot,
    normalizeRunningHubCapability,
    normalizeWorkflowFieldMappings,
    resolveModelChannel,
    useConfigStore,
    useEffectiveConfig,
    type RunningHubWorkflow,
    type WorkflowFieldMapping,
} from "@/stores/use-config-store";
import { ModelIcon } from "@/components/model-picker";

async function readWorkflowJsonFile(file: File): Promise<Record<string, unknown>> {
    const text = await file.text();
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new Error("工作流 JSON 无法解析，请上传 ComfyUI「Save (API Format)」导出的 .json 文件");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !Object.keys(parsed as object).length) {
        throw new Error("工作流 JSON 为空或不是对象");
    }
    return parsed as Record<string, unknown>;
}

function workflowIdFromFileName(fileName: string) {
    return fileName.replace(/\.[^.]+$/, "").trim() || `comfyui-${Date.now()}`;
}

export function LocalGenerationDefaultsPane() {
    const { message } = App.useApp();
    const config = useConfigStore((state) => state.config);
    const effectiveConfig = useEffectiveConfig();
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const comfyUI = config.comfyUI;
    const [activeSlot, setActiveSlot] = useState<WorkflowUsageSlot>("image_t2i");
    const [selectedId, setSelectedId] = useState(comfyUI.workflowId || "");
    const repairedRef = useRef(false);

    useEffect(() => {
        if (repairedRef.current) return;
        const result = ensureComfyUIWorkflowFieldBindings(comfyUI);
        if (!result.changed) {
            repairedRef.current = true;
            return;
        }
        repairedRef.current = true;
        updateConfig("comfyUI", result.config);
        message.success(`已自动补齐 ${result.report.filter((item) => item.prompt).length} 个工作流的提示词/参考图映射`);
    }, [comfyUI, message, updateConfig]);

    const selected = useMemo(
        () => comfyUI.workflows.find((item) => item.workflowId.trim() === selectedId.trim())
            || comfyUI.workflows.find((item) => item.workflowId.trim() === comfyUI.defaultWorkflows?.[activeSlot]?.trim()),
        [activeSlot, comfyUI.defaultWorkflows, comfyUI.workflows, selectedId],
    );

    const textModels = filterModelsByCapability(effectiveConfig.models, "text", effectiveConfig.channels);

    const updateComfy = (patch: Partial<typeof comfyUI>) => updateConfig("comfyUI", { ...comfyUI, ...patch });

    const persistWorkflow = (workflow: RunningHubWorkflow, slot: WorkflowUsageSlot, makeDefault: boolean) => {
        const nextKey = workflow.workflowId.trim();
        const capability = capabilityFromUsageSlot(slot);
        const next: RunningHubWorkflow = {
            ...workflow,
            kind: "workflow",
            workflowId: nextKey,
            capability,
            usageSlot: slot,
            fields: normalizeWorkflowFieldMappings(workflow.fields, capability),
        };
        let nextConfig = {
            ...comfyUI,
            workflowId: nextKey,
            capability,
            workflows: [...comfyUI.workflows.filter((item) => item.workflowId.trim() !== nextKey), next],
        };
        if (makeDefault || !nextConfig.defaultWorkflows?.[slot]) {
            nextConfig = setComfyUIDefaultWorkflow(nextConfig, slot, nextKey);
        }
        updateConfig("comfyUI", nextConfig);
        setSelectedId(nextKey);
        return next;
    };

    const importForSlot = async (slot: WorkflowUsageSlot, file: File | undefined) => {
        if (!file) return;
        try {
            const parsed = await readWorkflowJsonFile(file);
            const id = workflowIdFromFileName(file.name);
            const inferred = workflowVideoFieldsFromJson(parsed) as WorkflowFieldMapping[];
            const drafted: RunningHubWorkflow = {
                kind: "workflow",
                workflowId: id,
                title: id,
                capability: capabilityFromUsageSlot(slot),
                usageSlot: slot,
                workflowJson: parsed,
                fields: inferred,
            };
            const withDefaults = {
                ...comfyUI,
                workflows: [...comfyUI.workflows.filter((item) => item.workflowId.trim() !== id), drafted],
            };
            const repaired = ensureComfyUIWorkflowFieldBindings(withDefaults).config;
            let nextConfig = setComfyUIDefaultWorkflow(repaired, slot, id);
            nextConfig = {
                ...nextConfig,
                workflowId: id,
                capability: capabilityFromUsageSlot(slot),
            };
            updateConfig("comfyUI", nextConfig);
            setSelectedId(id);
            setActiveSlot(slot);
            message.success(`已设为「${workflowUsageSlotLabel(slot)}」默认工作流`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "读取工作流文件失败");
        }
    };

    const removeWorkflow = (workflow: RunningHubWorkflow) => {
        const nextWorkflows = comfyUI.workflows.filter((item) => item.workflowId.trim() !== workflow.workflowId.trim());
        const nextDefaults = { ...(comfyUI.defaultWorkflows || {}) };
        for (const [slot, id] of Object.entries(nextDefaults)) {
            if (id === workflow.workflowId.trim()) delete nextDefaults[slot as WorkflowUsageSlot];
        }
        updateComfy({
            workflows: nextWorkflows,
            defaultWorkflows: nextDefaults,
            workflowId: selectedId.trim() === workflow.workflowId.trim() ? nextWorkflows[0]?.workflowId || "" : comfyUI.workflowId,
        });
        if (selectedId.trim() === workflow.workflowId.trim()) setSelectedId(nextWorkflows[0]?.workflowId || "");
    };

    return (
        <div className="space-y-6">
            <div className="settings-section space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="text-sm font-semibold">本机生成默认</h2>
                        <p className="mt-1 text-xs text-foreground/55">
                            文本走渠道 API；图片/视频各自绑定一份 ComfyUI API 工作流 JSON。同一 ComfyUI 地址下，不同工作流就当作不同模型。
                            视频能力对齐 MiniMax H3 Director：T2V / I2V / FL2V / R2V / V2V / RV2V。
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-foreground/55">启用 ComfyUI</span>
                        <Switch checked={comfyUI.enabled} checkedChildren="启用" unCheckedChildren="停用" onChange={(enabled) => updateComfy({ enabled })} />
                    </div>
                </div>
                <Form layout="vertical">
                    <Form.Item label="ComfyUI Base URL" className="mb-0" extra="默认连接本机 8188；所有工作流都打到这个地址。">
                        <Input
                            value={comfyUI.baseUrl}
                            placeholder="http://127.0.0.1:8188"
                            onChange={(event) => updateComfy({ baseUrl: event.target.value })}
                            onBlur={(event) => updateComfy({ baseUrl: event.target.value.trim() || "http://127.0.0.1:8188" })}
                        />
                    </Form.Item>
                </Form>
            </div>

            <div className="settings-section space-y-3">
                <h3 className="text-sm font-semibold">默认文本 API 模型</h3>
                <p className="text-xs text-foreground/55">来自「个人渠道」里已配置的文本模型，不走 ComfyUI。</p>
                {textModels.length ? (
                    <div role="radiogroup" aria-label="默认文本模型" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {textModels.map((model) => {
                            const channel = resolveModelChannel(effectiveConfig, model);
                            const selectedModel = effectiveConfig.textModel === model;
                            return (
                                <button
                                    key={model}
                                    type="button"
                                    role="radio"
                                    aria-checked={selectedModel}
                                    className={cn(
                                        "model-default-option group relative overflow-hidden rounded-md px-3 py-2.5 text-left transition-colors",
                                        selectedModel && "is-selected",
                                    )}
                                    onClick={() => updateConfig("textModel", model)}
                                >
                                    <span className="flex min-w-0 items-start gap-2.5">
                                        <span className="model-default-option-icon grid size-8 shrink-0 place-items-center rounded-md">
                                            <ModelIcon config={effectiveConfig} model={model} />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-xs font-semibold">{modelDisplayName(effectiveConfig, model)}</span>
                                            <span className="mt-1 block truncate text-[var(--fs-tiny)] text-foreground/45">{channel.name || "未命名渠道"}</span>
                                        </span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <p className="text-xs text-foreground/45">请先在「个人渠道」配置文本模型。</p>
                )}
            </div>

            {(["image", "video"] as const).map((group) => (
                <div key={group} className="settings-section space-y-3">
                    <div>
                        <h3 className="text-sm font-semibold">{group === "image" ? "图片 · ComfyUI 工作流" : "视频 · H3 Director 工作流"}</h3>
                        <p className="mt-1 text-xs text-foreground/55">
                            {group === "image" ? "每个能力上传一份 API Format JSON，并自动设为该能力默认。" : "对应插件 task_type；画布按输入与操作自动选用默认工作流。"}
                        </p>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2">
                        {WORKFLOW_USAGE_SLOT_OPTIONS.filter((item) => item.group === group).map((option) => {
                            const defaultId = comfyUI.defaultWorkflows?.[option.value]?.trim() || "";
                            const workflow = comfyUI.workflows.find((item) => item.workflowId.trim() === defaultId);
                            const isActive = activeSlot === option.value;
                            return (
                                <div
                                    key={option.value}
                                    className={cn("rounded-lg border px-3 py-3", isActive ? "border-foreground/30 bg-surface-active/60" : "border-border/60 bg-surface-active/30")}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1.5 text-xs font-semibold">
                                                <Star className={`size-3.5 ${workflow ? "text-amber-500" : "text-foreground/25"}`} aria-hidden="true" />
                                                {option.label}
                                                <span className="rounded bg-foreground/8 px-1.5 py-0.5 text-[var(--fs-tiny)] font-medium text-foreground/55">{option.shortLabel}</span>
                                            </div>
                                            <p className="mt-1 text-[var(--fs-tiny)] text-foreground/45">{option.hint}</p>
                                            <p className="mt-2 truncate text-xs text-foreground/70">
                                                {workflow ? workflow.title || workflow.workflowId : "未设置默认工作流"}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <Upload
                                            accept="application/json,.json"
                                            showUploadList={false}
                                            beforeUpload={(file) => {
                                                void importForSlot(option.value, file);
                                                return Upload.LIST_IGNORE;
                                            }}
                                        >
                                            <Button size="small" icon={<UploadCloud className="size-3.5" />}>
                                                {workflow ? "更换 JSON" : "上传 JSON"}
                                            </Button>
                                        </Upload>
                                        {workflow ? (
                                            <Button
                                                size="small"
                                                type={isActive ? "primary" : "default"}
                                                onClick={() => {
                                                    setActiveSlot(option.value);
                                                    setSelectedId(workflow.workflowId);
                                                    updateComfy({ workflowId: workflow.workflowId, capability: capabilityFromUsageSlot(option.value) });
                                                }}
                                            >
                                                字段映射
                                            </Button>
                                        ) : null}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}

            {comfyUI.workflows.length ? (
                <div className="settings-section space-y-2">
                    <h3 className="text-xs font-semibold text-foreground/70">已保存工作流 {comfyUI.workflows.length}</h3>
                    {comfyUI.workflows.map((workflow) => {
                        const slot = normalizePersistedUsageSlot(workflow.usageSlot, normalizeRunningHubCapability(workflow.capability, comfyUI.capability)) || "image_t2i";
                        const isDefault = comfyUI.defaultWorkflows?.[slot]?.trim() === workflow.workflowId.trim();
                        const active = selected?.workflowId.trim() === workflow.workflowId.trim();
                        return (
                            <div key={workflow.workflowId} className="flex items-center justify-between gap-3 rounded-md bg-surface-active px-3 py-2">
                                <button
                                    type="button"
                                    className="min-w-0 flex-1 text-left"
                                    onClick={() => {
                                        setSelectedId(workflow.workflowId);
                                        setActiveSlot(slot);
                                        updateComfy({ workflowId: workflow.workflowId, capability: capabilityFromUsageSlot(slot) });
                                    }}
                                >
                                    <div className="truncate text-xs font-medium">
                                        {workflow.title || workflow.workflowId}
                                        {active ? " · 编辑中" : ""}
                                        {isDefault ? " · 默认" : ""}
                                    </div>
                                    <div className="mt-0.5 text-[var(--fs-tiny)] text-foreground/45">
                                        {workflowUsageSlotLabel(slot)} · {Object.keys(workflow.workflowJson || {}).length} 个节点
                                    </div>
                                </button>
                                <div className="flex shrink-0 items-center gap-1">
                                    {!isDefault ? (
                                        <Button
                                            type="text"
                                            size="small"
                                            onClick={() => {
                                                updateConfig("comfyUI", setComfyUIDefaultWorkflow(comfyUI, slot, workflow.workflowId));
                                                message.success(`已设为「${workflowUsageSlotLabel(slot)}」默认`);
                                            }}
                                        >
                                            设为默认
                                        </Button>
                                    ) : null}
                                    <Popconfirm title="删除该工作流？" okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => removeWorkflow(workflow)}>
                                        <Button danger type="text" size="small">删除</Button>
                                    </Popconfirm>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : null}

            {selected ? (
                <div className="settings-section space-y-2">
                    <h3 className="text-xs font-semibold">
                        字段映射 · {selected.title || selected.workflowId}
                        <span className="ml-2 font-normal text-foreground/45">{workflowUsageSlotLabel(selected.usageSlot) || ""}</span>
                    </h3>
                    <p className="text-[var(--fs-tiny)] text-foreground/45">把提示词、参考图等业务字段接到工作流节点；改动会立即写入当前工作流。</p>
                    <WorkflowFieldMappingEditor
                        fields={selected.fields || []}
                        onChange={(fields) => {
                            const slot = normalizePersistedUsageSlot(selected.usageSlot, selected.capability || "image") || activeSlot;
                            persistWorkflow({ ...selected, fields }, slot, false);
                        }}
                    />
                </div>
            ) : (
                <div className="settings-section flex items-center gap-2 rounded-lg border border-dashed border-border/60 px-4 py-8 text-xs text-foreground/45">
                    <FileJson2 className="size-4" />
                    上传各能力的工作流 JSON 后，可在这里精细映射字段。
                </div>
            )}
        </div>
    );
}
