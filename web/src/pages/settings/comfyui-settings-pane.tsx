import { App, Button, Form, Input, Popconfirm, Select, Upload } from "antd";
import { FileJson2, Star, UploadCloud } from "lucide-react";
import { useEffect, useState } from "react";

import { Switch } from "@/components/ui/base/switch";
import { WorkflowFieldMappingEditor } from "@/components/workflow-field-mapping-editor";
import {
    WORKFLOW_USAGE_SLOT_OPTIONS,
    capabilityFromUsageSlot,
    setComfyUIDefaultWorkflow,
    workflowUsageSlotLabel,
    type WorkflowUsageSlot,
} from "@/lib/canvas/workflow-usage-slot";
import { workflowVideoFieldsFromJson } from "@/lib/model-capabilities";
import {
    normalizePersistedUsageSlot,
    normalizeRunningHubCapability,
    normalizeWorkflowFieldMappings,
    useConfigStore,
    type RunningHubWorkflow,
    type WorkflowFieldMapping,
} from "@/stores/use-config-store";

function workflowIdFromFileName(fileName: string) {
    const base = fileName.replace(/\.[^.]+$/, "").trim();
    return base || `comfyui-${Date.now()}`;
}

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

export function ComfyUISettingsPane() {
    const { message } = App.useApp();
    const config = useConfigStore((state) => state.config);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const comfyUI = config.comfyUI;
    const selected = comfyUI.workflows.find((item) => item.workflowId.trim() === comfyUI.workflowId.trim());
    const [draftId, setDraftId] = useState(selected?.workflowId || "");
    const [title, setTitle] = useState(selected?.title || "");
    const [usageSlot, setUsageSlot] = useState<WorkflowUsageSlot>(normalizePersistedUsageSlot(selected?.usageSlot, comfyUI.capability) || "image_t2i");
    const [pendingFileName, setPendingFileName] = useState("");
    const [pendingWorkflowJson, setPendingWorkflowJson] = useState<Record<string, unknown> | null>(null);

    useEffect(() => {
        if (!selected) return;
        setDraftId(selected.workflowId);
        setTitle(selected.title || "");
        setUsageSlot(normalizePersistedUsageSlot(selected.usageSlot, selected.capability || comfyUI.capability) || "image_t2i");
        setPendingFileName("");
        setPendingWorkflowJson(null);
    }, [selected?.workflowId, selected?.title, selected?.capability, selected?.usageSlot, selected?.workflowJson, comfyUI.capability]);

    const update = (patch: Partial<typeof comfyUI>) => updateConfig("comfyUI", { ...comfyUI, ...patch });

    const persistWorkflow = (workflow: RunningHubWorkflow, nextSlot = usageSlot, makeDefault = false) => {
        const nextKey = workflow.workflowId.trim();
        const capability = capabilityFromUsageSlot(nextSlot);
        const next: RunningHubWorkflow = {
            ...workflow,
            kind: "workflow",
            workflowId: nextKey,
            capability,
            usageSlot: nextSlot,
            fields: normalizeWorkflowFieldMappings(workflow.fields, capability),
        };
        let nextConfig: typeof comfyUI = {
            ...comfyUI,
            workflowId: nextKey,
            capability,
            workflows: [...comfyUI.workflows.filter((item) => item.workflowId.trim() !== nextKey), next],
        };
        const defaults = nextConfig.defaultWorkflows || {};
        if (makeDefault || !defaults[nextSlot]) {
            nextConfig = setComfyUIDefaultWorkflow(nextConfig, nextSlot, nextKey);
        }
        updateConfig("comfyUI", nextConfig);
        return next;
    };

    const loadWorkflowFile = async (file: File | undefined) => {
        if (!file) return;
        try {
            const parsed = await readWorkflowJsonFile(file);
            const idFromFile = workflowIdFromFileName(file.name);
            setPendingWorkflowJson(parsed);
            setPendingFileName(file.name);
            if (!draftId.trim()) setDraftId(idFromFile);
            if (!title.trim()) setTitle(idFromFile);
            message.success(`已读取 ${file.name}（${Object.keys(parsed).length} 个节点）`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "读取工作流文件失败");
        }
    };

    const importWorkflow = (asDefault = true) => {
        if (!pendingWorkflowJson) {
            message.error("请先上传 ComfyUI API 格式工作流 .json 文件");
            return;
        }
        const id = draftId.trim() || workflowIdFromFileName(pendingFileName || `comfyui-${Date.now()}`);
        const inferred = workflowVideoFieldsFromJson(pendingWorkflowJson) as WorkflowFieldMapping[];
        const item: RunningHubWorkflow = {
            kind: "workflow",
            workflowId: id,
            title: title.trim() || id,
            capability: capabilityFromUsageSlot(usageSlot),
            usageSlot,
            workflowJson: pendingWorkflowJson,
            fields: inferred.length ? inferred : selected?.fields || [],
        };
        persistWorkflow(item, usageSlot, asDefault);
        setPendingFileName("");
        setPendingWorkflowJson(null);
        message.success(asDefault ? `已保存并设为「${workflowUsageSlotLabel(usageSlot)}」默认` : "本机 ComfyUI 工作流已保存");
    };

    const removeWorkflow = (workflow: RunningHubWorkflow) => {
        const nextWorkflows = comfyUI.workflows.filter((item) => item.workflowId.trim() !== workflow.workflowId.trim());
        const nextDefaults = { ...(comfyUI.defaultWorkflows || {}) };
        for (const [slot, id] of Object.entries(nextDefaults)) {
            if (id === workflow.workflowId.trim()) delete nextDefaults[slot as WorkflowUsageSlot];
        }
        update({
            workflows: nextWorkflows,
            defaultWorkflows: nextDefaults,
            workflowId: comfyUI.workflowId.trim() === workflow.workflowId.trim() ? nextWorkflows[0]?.workflowId || "" : comfyUI.workflowId,
        });
    };

    const setDefaultForSlot = (slot: WorkflowUsageSlot, workflowId: string) => {
        updateConfig("comfyUI", setComfyUIDefaultWorkflow(comfyUI, slot, workflowId));
        message.success(`已将「${workflowUsageSlotLabel(slot)}」默认设为该工作流`);
    };

    return (
        <div className="settings-section space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-sm font-semibold">本机 ComfyUI</h2>
                    <p className="mt-1 text-xs text-foreground/55">
                        按能力分别导入工作流（文生图、参考图、编辑、文生/图生视频等），并设置各能力默认项；画布会按当前输入自动选用。
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-foreground/55">启用</span>
                    <Switch checked={comfyUI.enabled} checkedChildren="启用" unCheckedChildren="停用" onChange={(enabled) => update({ enabled })} />
                </div>
            </div>

            <div className="space-y-2 rounded-lg border border-border/60 bg-surface-active/40 px-3 py-3">
                <h3 className="text-xs font-semibold text-foreground/70">各能力默认工作流</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                    {WORKFLOW_USAGE_SLOT_OPTIONS.map((option) => {
                        const defaultId = comfyUI.defaultWorkflows?.[option.value]?.trim() || "";
                        const workflow = comfyUI.workflows.find((item) => item.workflowId.trim() === defaultId);
                        return (
                            <div key={option.value} className="rounded-md bg-background/40 px-3 py-2">
                                <div className="flex items-center gap-1.5 text-xs font-medium">
                                    <Star className={`size-3 ${workflow ? "text-amber-500" : "text-foreground/25"}`} aria-hidden="true" />
                                    {option.label}
                                </div>
                                <div className="mt-0.5 truncate text-[var(--fs-tiny)] text-foreground/45">
                                    {workflow ? workflow.title || workflow.workflowId : "未设置 · 生成时回退到同能力其他工作流"}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <Form layout="vertical" className="grid gap-3 sm:grid-cols-2">
                <Form.Item label="Base URL" className="mb-0 sm:col-span-2">
                    <Input value={comfyUI.baseUrl} placeholder="http://127.0.0.1:8188" onChange={(event) => update({ baseUrl: event.target.value })} onBlur={(event) => update({ baseUrl: event.target.value.trim() || "http://127.0.0.1:8188" })} />
                </Form.Item>
                <Form.Item label="工作流 ID" className="mb-0">
                    <Input value={draftId} placeholder="例如 qwen-image-v21" onChange={(event) => setDraftId(event.target.value)} />
                </Form.Item>
                <Form.Item label="显示名称" className="mb-0">
                    <Input value={title} placeholder="可选" onChange={(event) => setTitle(event.target.value)} />
                </Form.Item>
                <Form.Item label="能力用途" className="mb-0 sm:col-span-2" extra="同一「图片/视频」下再细分；保存时会写入该能力，并可设为默认。">
                    <Select
                        value={usageSlot}
                        options={WORKFLOW_USAGE_SLOT_OPTIONS.map((item) => ({
                            value: item.value,
                            label: `${item.label}（${item.capability === "video" ? "视频" : "图片"}）`,
                            title: item.hint,
                        }))}
                        onChange={(value) => setUsageSlot(value as WorkflowUsageSlot)}
                    />
                </Form.Item>
                <Form.Item label="工作流文件（API Format）" className="mb-0 sm:col-span-2" extra="在 ComfyUI 菜单选择 Save (API Format)，上传导出的 .json 文件。">
                    <Upload.Dragger
                        accept="application/json,.json"
                        maxCount={1}
                        showUploadList={false}
                        beforeUpload={(file) => {
                            void loadWorkflowFile(file);
                            return Upload.LIST_IGNORE;
                        }}
                        styles={{
                            root: { display: "block", width: "100%" },
                            trigger: { borderColor: "var(--border)", borderRadius: "var(--r-lg)", background: "var(--workspace-surface)" },
                        }}
                    >
                        <div className="flex min-h-28 flex-col items-center justify-center px-4 py-6 text-center">
                            <span className="grid size-10 place-items-center rounded-lg bg-foreground/[.06] text-foreground/70">
                                <UploadCloud className="size-5" aria-hidden="true" />
                            </span>
                            <p className="mt-3 text-sm font-medium">拖入 .json 文件，或点击选择</p>
                            <p className="mt-1 text-xs text-foreground/45">仅支持 ComfyUI API Format 导出的 JSON</p>
                        </div>
                    </Upload.Dragger>
                    {pendingFileName ? (
                        <div className="mt-2 flex items-center gap-2 rounded-md bg-surface-active px-3 py-2 text-xs text-foreground/70">
                            <FileJson2 className="size-3.5 shrink-0" aria-hidden="true" />
                            <span className="min-w-0 truncate">{pendingFileName}</span>
                            <span className="shrink-0 text-foreground/45">· {Object.keys(pendingWorkflowJson || {}).length} 个节点</span>
                            <Button type="text" size="small" className="ml-auto" onClick={() => { setPendingFileName(""); setPendingWorkflowJson(null); }}>
                                清除
                            </Button>
                        </div>
                    ) : null}
                </Form.Item>
            </Form>

            <div className="flex flex-wrap gap-2">
                <Button type="primary" disabled={!pendingWorkflowJson} onClick={() => importWorkflow(true)}>
                    保存并设为该能力默认
                </Button>
                <Button disabled={!pendingWorkflowJson} onClick={() => importWorkflow(false)}>
                    仅保存
                </Button>
            </div>

            {comfyUI.workflows.length ? (
                <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-foreground/70">已保存 {comfyUI.workflows.length} 个</h3>
                    {comfyUI.workflows.map((workflow) => {
                        const active = workflow.workflowId.trim() === comfyUI.workflowId.trim();
                        const slot = normalizePersistedUsageSlot(workflow.usageSlot, normalizeRunningHubCapability(workflow.capability, comfyUI.capability)) || "image_t2i";
                        const isDefault = comfyUI.defaultWorkflows?.[slot]?.trim() === workflow.workflowId.trim();
                        return (
                            <div key={workflow.workflowId} className="flex items-center justify-between gap-3 rounded-md bg-surface-active px-3 py-2">
                                <button
                                    type="button"
                                    className="min-w-0 flex-1 text-left"
                                    onClick={() => update({
                                        workflowId: workflow.workflowId,
                                        capability: capabilityFromUsageSlot(slot),
                                    })}
                                >
                                    <div className="truncate text-xs font-medium">
                                        {workflow.title || workflow.workflowId}
                                        {active ? " · 当前编辑" : ""}
                                        {isDefault ? " · 默认" : ""}
                                    </div>
                                    <div className="mt-0.5 text-[var(--fs-tiny)] text-foreground/45">
                                        {workflowUsageSlotLabel(slot)} · {Object.keys(workflow.workflowJson || {}).length} 个节点
                                    </div>
                                </button>
                                <div className="flex shrink-0 items-center gap-1">
                                    {!isDefault ? (
                                        <Button type="text" size="small" onClick={() => setDefaultForSlot(slot, workflow.workflowId)}>
                                            设为默认
                                        </Button>
                                    ) : null}
                                    <Popconfirm title="删除该工作流？" okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => removeWorkflow(workflow)}>
                                        <Button danger type="text" size="small">
                                            删除
                                        </Button>
                                    </Popconfirm>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : null}

            {selected ? (
                <div className="space-y-2">
                    <h3 className="text-xs font-semibold">字段映射 · {selected.title || selected.workflowId}</h3>
                    <WorkflowFieldMappingEditor
                        fields={selected.fields || []}
                        onChange={(fields) => persistWorkflow({ ...selected, fields }, usageSlot, false)}
                    />
                </div>
            ) : null}
        </div>
    );
}
