import assert from "node:assert/strict";
import { buildBom, DEFAULT_CONFIG } from "../src/model.ts";

const first = buildBom(DEFAULT_CONFIG);
const second = buildBom(structuredClone(DEFAULT_CONFIG));
assert.ok(first.length > 0, "默认配置应生成 BOM");
assert.deepEqual(
  first.map(identity),
  second.map(identity),
  "相同配置应生成稳定物料身份"
);
assert.ok(first.every((item) => item.materialKey && item.specKey && item.category), "每条 BOM 都必须有物料键、规格键和分类");
assert.ok(first.every((item) => ["frame", "panel", "door", "interior", "glass", "hardware"].includes(item.category)), "分类必须属于价格工作台固定分类");
assert.ok(first.some((item) => item.materialKey === "brassBall" && item.category === "frame"), "球节点应归入框架管件");
assert.ok(first.some((item) => item.materialKey === "tube304" && item.category === "frame"), "钢管应使用统一物料键");
assert.ok(first.filter((item) => item.materialKey === "tube304").every((item) => item.finish === DEFAULT_CONFIG.frameFinish), "钢管库存身份应包含表面处理");

console.log(`BOM identity verification passed: ${first.length} lines.`);

function identity(item) {
  return {
    materialKey: item.materialKey,
    specKey: item.specKey,
    category: item.category,
    name: item.name,
    finish: item.finish,
    qty: item.qty,
    unit: item.unit
  };
}
