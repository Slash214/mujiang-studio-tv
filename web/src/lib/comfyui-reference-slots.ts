import type { WorkflowFieldMapping } from "@/stores/use-config-store";

type WorkflowPayload = {
    interfaceType: string;
    workflowJson: Record<string, unknown>;
    workflowFields: WorkflowFieldMapping[];
};

/**
 * Qwen's optional image inputs must be absent, not connected to an empty
 * LoadImage. Only blank template slots are pruned; saved image inputs are kept.
 * Work on the task snapshot so retries and concurrent submissions stay isolated.
 */
export function prepareComfyUIReferenceSlots<T extends WorkflowPayload>(payload: T, imageCount: number): T {
    if (payload.interfaceType !== "comfyui-local-image") return payload;
    const graph = structuredClone(payload.workflowJson) as Record<string, {
        class_type: string;
        inputs: Record<string, unknown>;
    }>;
    const emptySlots = payload.workflowFields.filter((field) => field.enabled !== false
        && field.source === "referenceImage"
        && field.fieldName === "image"
        && graph[field.nodeId]?.class_type === "LoadImage"
        && graph[field.nodeId].inputs.image === "");
    if (!emptySlots.length) return payload;

    const imageFields = payload.workflowFields.filter((field) => field.enabled !== false && field.source === "referenceImage");
    const indexOf = (field: WorkflowFieldMapping) => field.imageOrder ? field.imageOrder - 1 : field.sourceIndex ?? 0;
    const capacity = Math.max(...imageFields.map((field) => indexOf(field) + 1));
    if (imageCount > capacity) throw new Error(`当前工作流最多支持 ${capacity} 张参考图`);

    const removed = new Set<string>();
    for (const field of emptySlots) {
        if (indexOf(field) < imageCount) continue;
        if (field.required) throw new Error(`请连接第 ${indexOf(field) + 1} 张参考图`);
        for (const node of Object.values(graph)) {
            for (const [name, value] of Object.entries(node.inputs)) {
                if (!Array.isArray(value) || String(value[0]) !== field.nodeId) continue;
                if (node.class_type !== "TextEncodeQwenImage21" || !/^images\.image_\d+$/.test(name)) {
                    throw new Error("未连接的参考图仍被其他节点使用，请检查工作流");
                }
                delete node.inputs[name];
            }
        }
        delete graph[field.nodeId];
        removed.add(field.nodeId);
    }
    return { ...payload, workflowJson: graph, workflowFields: payload.workflowFields.filter((field) => !removed.has(field.nodeId)) };
}
