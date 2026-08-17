import assert from "node:assert/strict";
import test from "node:test";
import type { PriceListItem } from "@usm/contracts";
import { buildBom, DEFAULT_CONFIG } from "../../../src/model.js";
import {
  ConfiguratorPriceCalculator,
  allocateDealerLineTotals,
  buildLegacyPriceCatalog
} from "../src/services/price-calculator.js";

test("dealer settlement uses the retail total and settlement percentage", () => {
  const allocation = allocateDealerLineTotals([25_000], 88);

  assert.equal(allocation.purchaseTotalMinor, 22_000);
  assert.deepEqual(allocation.lineTotalsMinor, [22_000]);
});

test("the last priced line absorbs rounding differences", () => {
  const allocation = allocateDealerLineTotals([101, 101, 101], 88);

  assert.equal(allocation.purchaseTotalMinor, 267);
  assert.deepEqual(allocation.lineTotalsMinor, [89, 89, 89]);
  assert.equal(
    allocation.lineTotalsMinor.reduce((sum, amount) => sum + amount, 0),
    allocation.purchaseTotalMinor
  );
});

test("zero-value lines stay zero while the last priced line absorbs the difference", () => {
  const allocation = allocateDealerLineTotals([1, 0, 1, 0, 1], 50);

  assert.equal(allocation.purchaseTotalMinor, 2);
  assert.deepEqual(allocation.lineTotalsMinor, [1, 0, 1, 0, 0]);
  assert.equal(
    allocation.lineTotalsMinor.reduce((sum, amount) => sum + amount, 0),
    allocation.purchaseTotalMinor
  );
});

test("exact material and spec keys override the legacy name matcher", async () => {
  const legacyMatchedLine = buildBom(DEFAULT_CONFIG).find((line) => line.materialKey === "brassBall");
  assert.ok(legacyMatchedLine);
  const calculator = new ConfiguratorPriceCalculator(undefined, [priceItem({
    materialKey: legacyMatchedLine.materialKey,
    specKey: legacyMatchedLine.specKey,
    retailUnitPriceMinor: 25_000
  })]);

  const result = await calculator.priceBomLine(legacyMatchedLine as unknown as Record<string, unknown>, "CNY");

  assert.equal(result.pricingStatus, "priced");
  assert.equal(result.unitPriceMinor, 25_000);
  assert.deepEqual(result.metadata.materialKey, legacyMatchedLine.materialKey);
  assert.deepEqual(result.metadata.specKey, legacyMatchedLine.specKey);
});

test("standard direct prices are used only after legacy matching falls back", async () => {
  const calculator = new ConfiguratorPriceCalculator(undefined, [priceItem({
    materialKey: "customPart",
    specKey: "standard",
    retailUnitPriceMinor: 12_345
  })]);

  const result = await calculator.priceBomLine({
    materialKey: "customPart",
    specKey: "non-standard-spec",
    category: "hardware",
    name: "Custom part",
    spec: "non-standard-spec",
    qty: 2,
    unit: "件"
  }, "CNY");

  assert.equal(result.pricingStatus, "priced");
  assert.equal(result.unitPriceMinor, 12_345);
});

test("legacy panel variants become independent material keys with dimension-only specs", () => {
  const catalog = buildLegacyPriceCatalog();
  const fourRow = catalog.find((item) => item.materialKey === "panel.fourRowHole");
  const perforated = catalog.find((item) => item.materialKey === "panel.perforated");

  assert.ok(fourRow);
  assert.equal(fourRow.category, "panel");
  assert.match(fourRow.specKey, /^\d+x\d+$/);
  assert.doesNotMatch(fourRow.specification, /\u56db(?:\u6392|\u8fb9)\u5b54/);
  assert.ok(perforated);
  assert.equal(perforated.category, "panel");
  assert.equal(perforated.specKey, "335x335");
});

test("legacy catalog exposes dimension-specific glass price rows", () => {
  const glass = buildLegacyPriceCatalog().find((item) => item.materialKey === "glass" && item.specKey === "735x485");

  assert.ok(glass);
  assert.equal(glass.name, "玻璃板");
  assert.equal(glass.specification, "735 × 485 mm");
  assert.equal(glass.pricingMethod, "fixed");
  assert.equal(typeof glass.retailUnitPriceMinor, "number");
});

test("four-row panel direct prices match nominal BOM dimensions to factory dimensions", async () => {
  const calculator = new ConfiguratorPriceCalculator(undefined, [priceItem({
    materialKey: "panel.fourRowHole",
    specKey: "485x335",
    retailUnitPriceMinor: 12_345,
    unit: "\u5757"
  })]);

  const result = await calculator.priceBomLine({
    materialKey: "panel.fourRowHole",
    specKey: "500x350-mm",
    category: "panel",
    name: "\u6263\u677f\uff08\u56db\u6392\u5b54\uff09",
    spec: "500 x 350 mm",
    baseSpec: "500 x 350 mm",
    qty: 1,
    unit: "\u5757",
    unitPrice: 0
  }, "CNY");

  assert.equal(result.pricingStatus, "priced");
  assert.equal(result.unitPriceMinor, 12_345);
});

test("glass direct prices match the bulk inventory factory allowance", async () => {
  const calculator = new ConfiguratorPriceCalculator(undefined, [priceItem({
    materialKey: "glass",
    specKey: "330x230",
    retailUnitPriceMinor: 8_800,
    unit: "\u5757"
  })]);

  const result = await calculator.priceBomLine({
    materialKey: "glass",
    specKey: "350x250-mm",
    category: "glass",
    name: "\u73bb\u7483\u677f",
    spec: "350 x 250 mm",
    baseSpec: "350 x 250 mm",
    qty: 1,
    unit: "\u5757",
    unitPrice: 0
  }, "CNY");

  assert.equal(result.pricingStatus, "priced");
  assert.equal(result.unitPriceMinor, 8_800);
});

test("glass direct prices also match the customer quote factory allowance", async () => {
  const calculator = new ConfiguratorPriceCalculator(undefined, [priceItem({
    materialKey: "glass",
    specKey: "735x485",
    retailUnitPriceMinor: 9_900,
    unit: "\u5757"
  })]);

  const result = await calculator.priceBomLine({
    materialKey: "glass",
    specKey: "750x500-mm",
    category: "glass",
    name: "\u73bb\u7483\u677f",
    spec: "750 x 500 mm",
    baseSpec: "750 x 500 mm",
    qty: 1,
    unit: "\u5757",
    unitPrice: 0
  }, "CNY");

  assert.equal(result.pricingStatus, "priced");
  assert.equal(result.unitPriceMinor, 9_900);
});

test("expansion kit prices are split across the two BOM screws", async () => {
  const expansionScrews = buildBom(DEFAULT_CONFIG).find((line) => line.materialKey === "expansionSet");
  assert.ok(expansionScrews);
  const calculator = new ConfiguratorPriceCalculator(undefined, [priceItem({
    materialKey: "expansionSet",
    specKey: "standard",
    retailUnitPriceMinor: 600,
    unit: "\u5957"
  })]);

  const result = await calculator.priceBomLine(expansionScrews as unknown as Record<string, unknown>, "CNY");

  assert.equal(result.pricingStatus, "priced");
  assert.equal(result.quantity, expansionScrews.qty);
  assert.equal(result.unitPriceMinor, 300);
});

test("an explicit per-screw direct price is not split again", async () => {
  const expansionScrews = buildBom(DEFAULT_CONFIG).find((line) => line.materialKey === "expansionSet");
  assert.ok(expansionScrews);
  const calculator = new ConfiguratorPriceCalculator(undefined, [priceItem({
    materialKey: "expansionSet",
    specKey: expansionScrews.specKey,
    retailUnitPriceMinor: 250,
    unit: "\u9897"
  })]);

  const result = await calculator.priceBomLine(expansionScrews as unknown as Record<string, unknown>, "CNY");

  assert.equal(result.pricingStatus, "priced");
  assert.equal(result.unitPriceMinor, 250);
});

function priceItem(input: Pick<PriceListItem, "materialKey" | "specKey" | "retailUnitPriceMinor"> & Partial<Pick<PriceListItem, "unit">>): PriceListItem {
  return {
    id: `${input.materialKey}-${input.specKey}`,
    tenantId: "tenant-test",
    revision: 1,
    createdAt: "2026-08-13T00:00:00.000Z",
    updatedAt: "2026-08-13T00:00:00.000Z",
    priceListId: "price-list-test",
    materialKey: input.materialKey,
    specKey: input.specKey,
    category: "hardware",
    name: input.materialKey,
    specification: input.specKey,
    unit: "件",
    pricingMethod: "fixed",
    retailUnitPriceMinor: input.retailUnitPriceMinor,
    pricingRule: null,
    note: "",
    sourceRef: null,
    ...(input.unit ? { unit: input.unit } : {})
  };
}
