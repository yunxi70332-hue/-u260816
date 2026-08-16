import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

function body<T>(response: { body: string }): T {
  return JSON.parse(response.body) as T;
}

async function createSyncedDraft(app: Awaited<ReturnType<typeof buildApp>>, suffix: string) {
  const created = await app.inject({
    method: "POST",
    url: "/api/price-lists",
    payload: {
      name: `Validation ${suffix}`,
      code: `VAL-${suffix}`,
      market: `Validation-${suffix}`,
      currency: "CNY",
      version: "1",
      effectiveFrom: "2026-08-13"
    }
  });
  assert.equal(created.statusCode, 201);
  const priceListId = body<{ item: { id: string } }>(created).item.id;
  const synced = await app.inject({ method: "POST", url: `/api/price-lists/${priceListId}/sync-bom` });
  assert.equal(synced.statusCode, 200);
  return { priceListId, items: body<{ items: Array<Record<string, unknown>> }>(synced).items };
}

test("price list item batches reject duplicate stable keys", async (context) => {
  const app = await buildApp({ ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" });
  context.after(() => app.close());
  const { priceListId, items } = await createSyncedDraft(app, "duplicate");

  const response = await app.inject({
    method: "PUT",
    url: `/api/price-lists/${priceListId}/items`,
    payload: { items: [items[0], { ...items[0], id: "duplicate-row" }] }
  });

  assert.equal(response.statusCode, 422);
  assert.equal(body<{ error: { code: string } }>(response).error.code, "VALIDATION_ERROR");
});

test("empty and script-like pricing rules block publication", async (context) => {
  const app = await buildApp({ ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" });
  context.after(() => app.close());

  for (const [suffix, pricingRule] of [["empty", {}], ["script", { expression: "process.exit()" }]] as const) {
    const { priceListId, items } = await createSyncedDraft(app, suffix);
    const invalidItems = items.map((item, index) => index === 0
      ? { ...item, pricingMethod: "formula", retailUnitPriceMinor: null, pricingRule }
      : item);
    const saved = await app.inject({
      method: "PUT",
      url: `/api/price-lists/${priceListId}/items`,
      payload: { items: invalidItems }
    });
    assert.equal(saved.statusCode, 200);

    const validation = await app.inject({ method: "POST", url: `/api/price-lists/${priceListId}/validate` });
    const result = body<{ valid: boolean; errors: Array<{ code: string }> }>(validation);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.code === "MISSING_RULE"));

    const published = await app.inject({
      method: "POST",
      url: `/api/price-lists/${priceListId}/publish`,
      payload: { effectiveFrom: "2026-08-13" }
    });
    assert.equal(published.statusCode, 409);
  }
});

test("cloned drafts compare their prices with the active market version", async (context) => {
  const app = await buildApp({ ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" });
  context.after(() => app.close());

  const clonedResponse = await app.inject({
    method: "POST",
    url: "/api/price-lists/price-list-demo/clone",
    payload: {}
  });
  assert.equal(clonedResponse.statusCode, 201);
  const clonedId = body<{ item: { id: string } }>(clonedResponse).item.id;

  const detailResponse = await app.inject({ method: "GET", url: `/api/price-lists/${clonedId}` });
  assert.equal(detailResponse.statusCode, 200);
  const detail = body<{
    baseline: { id: string } | null;
    items: Array<{ retailUnitPriceMinor: number | null; previousRetailPriceMinor: number | null }>;
  }>(detailResponse);
  assert.equal(detail.baseline?.id, "price-list-demo");
  assert.ok(detail.items.length > 0);
  assert.ok(detail.items.every((item) => item.retailUnitPriceMinor === item.previousRetailPriceMinor));
});
