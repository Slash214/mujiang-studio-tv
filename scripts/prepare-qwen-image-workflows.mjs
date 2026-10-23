import fs from "node:fs";
import path from "node:path";

// Prepare only: installation uses the workspace's revision-checked settings API.
const [t2iPath, editPath, outputDirectory] = process.argv.slice(2);
if (!t2iPath || !editPath || !outputDirectory) throw new Error("Usage: node scripts/prepare-qwen-image-workflows.mjs <t2i.json> <edit.json> <output-directory>");
const t2i = JSON.parse(fs.readFileSync(t2iPath, "utf8"));
const edit = JSON.parse(fs.readFileSync(editPath, "utf8"));
const group = edit.definitions?.subgraphs?.find((item) => item.name === "Image Edit (Qwen Image 2.1)");
const instance = edit.nodes?.find((item) => item.type === group?.id);
if (!group || !instance || instance.widgets_values.length !== 20) throw new Error("Unrecognized Qwen edit template");
const setting = Object.fromEntries(group.inputs.slice(0, 20).map((input, index) => [input.name, instance.widgets_values[index]]));
if (setting.switch_1 !== false || setting.switch !== false) throw new Error("Expected enhancer and custom-size branches to be disabled in source template");
const clone = (value) => structuredClone(value);
const node = (class_type, inputs, title) => ({ class_type, inputs, _meta: { title } });

const t2iGraph = clone(t2i);
const encoderID = Object.keys(t2iGraph).find((id) => t2iGraph[id].class_type === "TextEncodeQwenImage21");
if (!encoderID) throw new Error("Missing Qwen text encoder");
const switchNode = Object.values(t2iGraph).find((item) => item.class_type === "ComfySwitchNode" && typeof item.inputs.on_false === "string");
if (!switchNode || switchNode.inputs.switch !== false) throw new Error("Expected direct prompt branch");
// Inline the currently selected prompt path. Disabled local prompt rewriting
// stays in the original file, not in the production task.
t2iGraph[encoderID].inputs.prompt = "";
const live = new Set();
function visit(graph, id) {
    if (live.has(id)) return;
    if (!graph[id]) throw new Error(`Missing linked node ${id}`);
    live.add(id);
    for (const value of Object.values(graph[id].inputs)) {
        if (Array.isArray(value) && value.length === 2) visit(graph, String(value[0]));
    }
}
for (const [id, item] of Object.entries(t2iGraph)) if (item.class_type === "SaveImageAdvanced") visit(t2iGraph, id);
for (const id of Object.keys(t2iGraph)) if (!live.has(id)) delete t2iGraph[id];

const editGraph = {
    "451": node("UNETLoader", { unet_name: setting.unet_name, weight_dtype: "default" }, "Qwen Image 2.1"),
    "453": node("CLIPLoader", { clip_name: setting.clip_name, type: "qwen_image", device: "default" }, "文本编码器"),
    "454": node("VAELoader", { vae_name: setting.vae_name }, "VAE"),
    "456": node("EmptyLatentImage", { width: setting.width, height: setting.height, batch_size: 1 }, "自定义输出尺寸"),
    "457": node("VAEDecode", { samples: ["458", 0], vae: ["454", 0] }, "解码"),
    "458": node("KSampler", {
        seed: setting.seed, steps: setting.steps, cfg: setting.cfg,
        sampler_name: setting.scheduler, scheduler: setting.scheduler_1, denoise: 1,
        model: ["469", 0], positive: ["474", 0], negative: ["474", 1], latent_image: ["468", 0],
    }, "采样"),
    "461": clone(t2i["461"]),
    "468": node("ComfySwitchNode", { switch: false, on_false: ["474", 2], on_true: ["456", 0] }, "自定义尺寸（关闭时跟随图1）"),
    "469": node("QwenImage21Cache", { model: ["451", 0], device: setting.device, dtype: setting.dtype }, "参考图缓存"),
    "474": node("TextEncodeQwenImage21", {
        clip: ["453", 0], vae: ["454", 0], prompt: "", negative_prompt: setting.negative_prompt,
        resolution: setting.resolution,
    }, "图片编辑提示词"),
};
editGraph["461"].inputs.images = ["457", 0];
editGraph["461"].inputs.filename_prefix = "Qwen_image_2.1_edit";
for (let index = 1; index <= 10; index++) {
    const id = String(100 + index);
    editGraph[id] = node("LoadImage", { image: "" }, index === 1 ? "图1：编辑底图" : `图${index}：参考图`);
    editGraph["474"].inputs[`images.image_${index}`] = [id, 0];
}

function entry(id, title, slot, graph) {
    const fields = [];
    for (const [nodeId, item] of Object.entries(graph)) {
        for (const [fieldName, fieldValue] of Object.entries(item.inputs)) {
            if (Array.isArray(fieldValue)) continue;
            fields.push({
                id: `${nodeId}::${fieldName}`, nodeId, classType: item.class_type, fieldName, fieldValue,
                fieldType: typeof fieldValue === "number" ? "NUMBER" : typeof fieldValue === "boolean" ? "BOOLEAN" : "TEXT",
                source: "", sourceAutomatic: false, enabled: false, role: "internal", safeToOverride: true,
            });
        }
    }
    return { kind: "workflow", workflowId: id, title, capability: "image", usageSlot: slot, workflowJson: graph, fields };
}
function expose(workflow, nodeId, fieldName, label, extra = {}) {
    const field = workflow.fields.find((item) => item.nodeId === nodeId && item.fieldName === fieldName);
    if (!field) throw new Error(`Missing field ${nodeId}.${fieldName}`);
    Object.assign(field, { enabled: true, role: "business", label }, extra);
}
const image = entry("qwen-image-2.1-official-t2i", "Qwen Image 2.1 官方 · 文生图", "image_t2i", t2iGraph);
expose(image, encoderID, "prompt", "提示词", { source: "prompt", sourceAutomatic: true, role: "prompt", required: true });
expose(image, "13", "aspect_ratio", "画幅", { options: ["1:1 (Square)", "2:3 (Portrait Photo)", "3:2 (Photo)", "3:4 (Portrait Standard)", "4:3 (Standard)", "9:16 (Portrait Widescreen)", "16:9 (Widescreen)", "21:9 (Ultrawide)"] });
expose(image, "13", "megapixels", "像素量（MP）", { min: 0.1, max: 4, step: 0.1 });
expose(image, "459:458", "steps", "采样步数", { min: 1, max: 100, step: 1 });
expose(image, "459:458", "seed", "种子", { randomEnabled: true, min: "0", max: "4294967295", step: 1 });

const editing = entry("qwen-image-2.1-official-edit", "Qwen Image 2.1 官方 · 图片编辑", "image_ref", editGraph);
editing.description = "图1是编辑底图，图2–10为参考；默认跟随图1尺寸。自定义宽高仅在自定义尺寸开启时生效。不含蒙版局部重绘。";
expose(editing, "474", "prompt", "编辑要求（用 <image1>、<image2> 指明图片）", { source: "prompt", sourceAutomatic: true, role: "prompt", required: true });
for (let index = 1; index <= 10; index++) expose(editing, String(100 + index), "image", `图${index}`, {
    source: "referenceImage", sourceAutomatic: true, role: "media", sourceIndex: index - 1, imageOrder: index, required: index === 1,
});
expose(editing, "468", "switch", "自定义尺寸（关闭时跟随图1）");
expose(editing, "456", "width", "自定义宽度（开启后生效）", { min: 256, max: 4096, step: 32 });
expose(editing, "456", "height", "自定义高度（开启后生效）", { min: 256, max: 4096, step: 32 });
expose(editing, "474", "resolution", "参考图缩放边长（0保留原尺寸）", { min: 0, max: 2048, step: 32 });
expose(editing, "458", "steps", "采样步数", { min: 1, max: 100, step: 1 });
expose(editing, "458", "seed", "种子", { randomEnabled: true, min: "0", max: "4294967295", step: 1 });

fs.mkdirSync(outputDirectory, { recursive: true });
for (const [source, name] of [[t2iPath, "source-t2i.json"], [editPath, "source-edit.json"]]) fs.copyFileSync(source, path.join(outputDirectory, name), fs.constants.COPYFILE_EXCL);
fs.writeFileSync(path.join(outputDirectory, "workflows.json"), JSON.stringify([image, editing], null, 2), { flag: "wx" });
for (const workflow of [image, editing]) fs.writeFileSync(path.join(outputDirectory, `${workflow.workflowId}.api.json`), JSON.stringify(workflow.workflowJson, null, 2), { flag: "wx" });
console.log(JSON.stringify({ prepared: [image, editing].map(({ workflowId, title, fields }) => ({ workflowId, title, exposedFields: fields.filter((field) => field.enabled).length })) }));
