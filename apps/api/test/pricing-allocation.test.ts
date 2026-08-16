import assert from "node:assert/strict";
import test from "node:test";
import type { PriceListItem } from "@usm/contracts";
import { buildBom, DEFAULT_CONFIG } from "../../../src/model.js";
import {
  ConfiguratorPriceCalculator,
  allocateDealerLineTotals
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

function priceItem(input: Pick<PriceListItem, "materialKey" | "specKey" | "retailUnitPriceMinor">): PriceListItem {
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
    sourceRef: null
  };
}
