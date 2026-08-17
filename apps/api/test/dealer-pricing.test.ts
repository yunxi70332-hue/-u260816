import assert from "node:assert/strict";
import test from "node:test";
import type { BomItem } from "../../../src/model.js";
import { priceBomItems, type DealerPriceSource } from "../../../src/pricing.js";

const source: DealerPriceSource = {
  schemaVersion: 1,
  id: "dealer-pricing-test",
  dealerName: "测试工厂",
  title: "测试报价",
  currency: "CNY",
  generatedAt: "2026-08-16T00:00:00.000Z",
  laborRules: [],
  items: [
    priceItem(1, "扣板", "panel", "735 × 485 mm", 100),
    priceItem(2, "扣板（四排孔）", "panel.fourRowHole", "735 x 485 mm", 120),
    priceItem(3, "玻璃板", "glass", "735 × 485 mm", 88),
    priceItem(4, "玻璃", "glass", "", 400),
    priceItem(5, "膨胀套件", "expansionSet", "", 10),
    priceItem(6, "层板", "shelfPanel", "", 30),
    priceItem(7, "托盘", "tray", "", 50)
  ]
};

test("prices four-row panels as a distinct SKU with normalized factory dimensions", () => {
  const [priced] = priceBomItems([
    bomItem("panel.fourRowHole", "扣板（四排孔）", "750 x 500 mm", "panel")
  ], source);

  assert.equal(priced.unitPrice, 120);
  assert.equal(priced.priceStatus, "sourceExact");
  assert.deepEqual(priced.priceSourceRows, [2]);
});

test("uses dimension-specific glass before the square-meter fallback", () => {
  const [priced] = priceBomItems([
    bomItem("glass", "玻璃板", "750 x 500 mm", "glass")
  ], source);

  assert.equal(priced.unitPrice, 88);
  assert.equal(priced.priceStatus, "sourceExact");
  assert.deepEqual(priced.priceSourceRows, [3]);
});

test("prices two production screws as one expansion kit", () => {
  const [priced] = priceBomItems([{
    ...bomItem("expansionSet", "膨胀螺丝", "2颗/根钢管", "hardware"),
    qty: 2,
    unit: "颗"
  }], source);

  assert.equal(priced.unitPrice, 5);
  assert.equal(priced.qty * priced.unitPrice, 10);
  assert.equal(priced.priceStatus, "sourceFormula");
});

test("accepts the customer-facing fixed and mobile tray aliases", () => {
  const priced = priceBomItems([
    bomItem("shelfPanel", "固定托盘", "750 x 350 mm", "interior"),
    bomItem("tray", "托盘", "750 x 350 mm", "interior")
  ], source);

  assert.deepEqual(priced.map((item) => item.unitPrice), [30, 50]);
  assert.ok(priced.every((item) => item.priceStatus === "sourceExact"));
});

function priceItem(sourceRow: number, name: string, canonicalName: string, spec: string, unitPrice: number) {
  return { sourceRow, page: 1, name, canonicalName, spec, unit: "件", unitPrice, pricingRule: null, note: "" };
}

function bomItem(materialKey: string, name: string, baseSpec: string, category: BomItem["category"]): BomItem {
  return {
    materialKey,
    specKey: baseSpec,
    category,
    name,
    spec: baseSpec,
    baseSpec,
    qty: 1,
    unit: "件",
    unitPrice: 0
  };
}
