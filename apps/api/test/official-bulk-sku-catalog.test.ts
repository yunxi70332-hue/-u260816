import assert from "node:assert/strict";
import test from "node:test";
import { matchOfficialBulkSku } from "../../../src/official-bulk-sku-catalog.js";

test("matches default factory panel and normalizes the configurator color", () => {
  const match = matchOfficialBulkSku({ materialKey: "panel", baseSpec: "750 x 350 mm", color: "#fffef0" });
  assert.equal(match?.skuCode, "扣板|扣板|735 × 335 mm|白色");
  assert.deepEqual(match && { category: match.category, specification: match.specification, color: match.color, unit: match.unit }, {
    category: "扣板",
    specification: "735 × 335 mm",
    color: "白色",
    unit: "块"
  });
});

test("uses the official tube length whitelist instead of generic dimensions", () => {
  assert.equal(matchOfficialBulkSku({ materialKey: "tube304", baseSpec: "750 mm" })?.specification, "732 mm");
  assert.equal(matchOfficialBulkSku({ materialKey: "tube304", baseSpec: "420 mm" }), null);
});

test("rejects a panel size that is not present in the workbook", () => {
  assert.equal(matchOfficialBulkSku({ materialKey: "panel", baseSpec: "420 x 310 mm", color: "#fffef0" }), null);
  assert.equal(matchOfficialBulkSku({ materialKey: "panel.perforated", baseSpec: "100 x 100 mm", color: "#fffef0" }), null);
});

test("matches the distinct panel subcategories with their own matrices", () => {
  assert.equal(matchOfficialBulkSku({ materialKey: "panel.perforated", baseSpec: "350 x 350 mm", color: "#e8602a" })?.subcategory, "扣板（洞洞）");
  assert.equal(matchOfficialBulkSku({ materialKey: "panel.fourRowHole", baseSpec: "750 x 500 mm", color: "#e8602a" }), null);
  assert.equal(matchOfficialBulkSku({ materialKey: "doorPanel", name: "门板（洞洞）", baseSpec: "350 x 350 mm", color: "#e8602a" })?.subcategory, "门板（洞洞）");
  assert.equal(matchOfficialBulkSku({ materialKey: "doorPanel", name: "门板（洞洞）", baseSpec: "750 x 350 mm", color: "#e8602a" }), null);
});

test("keeps door orientation and supports a standard and custom-shaped official drop door", () => {
  assert.equal(matchOfficialBulkSku({ materialKey: "doorPanel", baseSpec: "750 x 350 mm", color: "#2255a8" })?.specification, "735 × 335 mm");
  assert.equal(matchOfficialBulkSku({ materialKey: "door.drop.composite", baseSpec: "750 x 350 mm", color: "#2255a8" })?.subcategory, "门板");
  assert.equal(matchOfficialBulkSku({ materialKey: "doorPanel", baseSpec: "350 x 500 mm", color: "#2255a8" })?.specification, "335 × 485 mm");
  assert.equal(matchOfficialBulkSku({ materialKey: "doorPanel", baseSpec: "250 x 500 mm", color: "#2255a8" }), null);
  assert.equal(matchOfficialBulkSku({ materialKey: "door.flip.composite", baseSpec: "500 x 750 mm", color: "#2255a8" })?.specification, "485 × 735 mm");
});

test("matches shelves, trays, glass panels, and glass doors against explicit sets", () => {
  assert.equal(matchOfficialBulkSku({ materialKey: "shelfPanel", baseSpec: "750 x 350 mm", color: "#0c0c0c" })?.skuCode, "固定层板|固定层板|735 × 335 mm|黑色");
  assert.equal(matchOfficialBulkSku({ materialKey: "tray", baseSpec: "350 x 500 mm", color: "#0c0c0c" })?.specification, "335 × 485 mm");
  assert.equal(matchOfficialBulkSku({ materialKey: "glass", name: "玻璃板", baseSpec: "350 x 250 mm" })?.specification, "330 × 230 mm");
  assert.equal(matchOfficialBulkSku({ materialKey: "glass", name: "玻璃搁板", baseSpec: "350 x 250 mm" })?.subcategory, "固定玻璃层板");
  assert.equal(matchOfficialBulkSku({ materialKey: "door.glass.composite", baseSpec: "350 x 250 mm", color: "#0c0c0c" })?.specification, "328 × 228 mm");
  assert.equal(matchOfficialBulkSku({ materialKey: "door.glass.composite", baseSpec: "420 x 310 mm" }), null);
});

test("matches the workbook's fixed hardware rows and rejects unknown BOM rows", () => {
  assert.equal(matchOfficialBulkSku({ materialKey: "brassBall", spec: "标准连接球" })?.skuCode, "零件|珠子|珠子|零件");
  assert.equal(matchOfficialBulkSku({ name: "脚垫", materialKey: "glide" })?.skuCode, "零件|脚垫|脚垫|黑色");
  assert.equal(matchOfficialBulkSku({ name: "不存在的定制件", materialKey: "custom.thing", baseSpec: "750 x 350 mm" }), null);
});
