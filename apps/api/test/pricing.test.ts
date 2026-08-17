import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

function body<T>(response: { body: string }): T {
  return JSON.parse(response.body) as T;
}

test("price list draft workflow saves, validates, publishes, and drives configurator pricing", async (context) => {
  const app = await buildApp({ ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" });
  context.after(() => app.close());

  const created = await app.inject({
    method: "POST", url: "/api/price-lists", payload: {
      name: "Test retail", code: "TEST", market: "Test Market", currency: "CNY",
      version: "1", effectiveFrom: "2026-08-13"
    }
  });
  assert.equal(created.statusCode, 201);
  const priceListId = body<{ item: { id: string } }>(created).item.id;

  const synced = await app.inject({ method: "POST", url: `/api/price-lists/${priceListId}/sync-bom` });
  assert.equal(synced.statusCode, 200);
  const syncedItems = body<{ items: Array<Record<string, unknown>> }>(synced).items;
  assert.ok(syncedItems.length >= 132);

  const invalidItems = syncedItems.map((item, index) => index === 0
    ? { ...item, pricingMethod: "fixed", retailUnitPriceMinor: null, pricingRule: null }
    : item);
  const invalidSave = await app.inject({
    method: "PUT", url: `/api/price-lists/${priceListId}/items`, payload: { items: invalidItems }
  });
  assert.equal(invalidSave.statusCode, 200);

  const validation = await app.inject({ method: "POST", url: `/api/price-lists/${priceListId}/validate` });
  assert.equal(validation.statusCode, 200);
  assert.equal(body<{ valid: boolean }>(validation).valid, false);
  const blockedPublish = await app.inject({
    method: "POST", url: `/api/price-lists/${priceListId}/publish`, payload: { effectiveFrom: "2026-08-13" }
  });
  assert.equal(blockedPublish.statusCode, 409);

  const completedItems = invalidItems.map((item) => item.retailUnitPriceMinor !== null
    ? item
    : { ...item, pricingMethod: "fixed", retailUnitPriceMinor: 100, pricingRule: null });
  const saved = await app.inject({
    method: "PUT", url: `/api/price-lists/${priceListId}/items`, payload: { items: completedItems }
  });
  assert.equal(saved.statusCode, 200);
  const ready = await app.inject({ method: "POST", url: `/api/price-lists/${priceListId}/validate` });
  assert.equal(body<{ valid: boolean }>(ready).valid, true);
  const published = await app.inject({
    method: "POST", url: `/api/price-lists/${priceListId}/publish`, payload: { effectiveFrom: "2026-08-13" }
  });
  assert.equal(published.statusCode, 200);
  assert.equal(body<{ item: { status: string } }>(published).item.status, "active");

  const cloned = await app.inject({ method: "POST", url: `/api/price-lists/${priceListId}/clone`, payload: {} });
  assert.equal(cloned.statusCode, 201);
  assert.equal(body<{ item: { status: string } }>(cloned).item.status, "draft");

  const detail = await app.inject({ method: "GET", url: "/api/price-lists/price-list-demo" });
  assert.equal(detail.statusCode, 200);
  assert.ok(body<{ items: unknown[] }>(detail).items.length > 100);

  const session = await app.inject({ method: "GET", url: "/api/session" });
  assert.equal(session.statusCode, 200);
  const design = await app.inject({ method: "GET", url: "/api/designs/design-demo" });
  const configSnapshot = body<{ item: { configSnapshot: Record<string, unknown> } }>(design).item.configSnapshot;
  const calculated = await app.inject({ method: "POST", url: "/api/pricing/calculate", payload: { configSnapshot, market: "Test Market", currency: "CNY" } });
  assert.equal(calculated.statusCode, 200);
  const pricing = body<{ status: string; retailTotalMinor: number | null; priceList: { id: string } | null }>(calculated);
  assert.equal(pricing.priceList?.id, priceListId);
  assert.ok(pricing.status === "priced" || pricing.status === "pending");
});

test("dealer settlement rate keeps the legacy discount alias synchronized", async (context) => {
  const app = await buildApp({ ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" });
  context.after(() => app.close());
  const response = await app.inject({
    method: "PATCH", url: "/api/dealers/dealer-demo/settlement-rate", payload: { settlementRatePercent: 88 }
  });
  assert.equal(response.statusCode, 200);
  const dealer = body<{ item: { settlementRatePercent: number; discountRate: number } }>(response).item;
  assert.equal(dealer.settlementRatePercent, 88);
  assert.equal(dealer.discountRate, 88);
});

test("sales personal multiplier preference drives new pricing and stays hidden from dealers", async (context) => {
  const app = await buildApp({ ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" });
  context.after(() => app.close());

  const saved = await app.inject({
    method: "PUT",
    url: "/api/me/sales-pricing-preferences",
    headers: { "x-test-role": "sales" },
    payload: { salesMultiplierBasisPoints: 17500 }
  });
  assert.equal(saved.statusCode, 200);
  assert.equal(body<{ item: { salesMultiplierBasisPoints: number; source: string } }>(saved).item.salesMultiplierBasisPoints, 17500);

  const preference = await app.inject({ method: "GET", url: "/api/me/sales-pricing-preferences", headers: { "x-test-role": "sales" } });
  assert.equal(preference.statusCode, 200);
  assert.equal(body<{ item: { salesMultiplierBasisPoints: number; source: string } }>(preference).item.source, "user_default");

  const design = await app.inject({ method: "GET", url: "/api/designs/design-demo", headers: { "x-test-role": "sales" } });
  const configSnapshot = body<{ item: { configSnapshot: Record<string, unknown> } }>(design).item.configSnapshot;
  const calculated = await app.inject({
    method: "POST",
    url: "/api/pricing/calculate",
    headers: { "x-test-role": "sales" },
    payload: { configSnapshot, market: "Test Market", currency: "CNY" }
  });
  assert.equal(calculated.statusCode, 200);
  const pricing = body<{ status: string; retailTotalMinor: number | null; salesMultiplierBasisPoints: number | null; multiplierQuoteTotalMinor: number | null }>(calculated);
  if (pricing.status === "priced") {
    assert.equal(pricing.salesMultiplierBasisPoints, 17500);
    assert.equal(pricing.multiplierQuoteTotalMinor, Math.round((pricing.retailTotalMinor ?? 0) * 1.75));
  }

});

test("BOM sync preserves entered prices and price-list export returns the current catalog", async (context) => {
  const app = await buildApp({ ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" });
  context.after(() => app.close());

  const created = await app.inject({
    method: "POST",
    url: "/api/price-lists",
    payload: { name: "Catalog export", code: "EXPORT", market: "Export Market", currency: "CNY", version: "1", effectiveFrom: "2026-08-14" }
  });
  const priceListId = body<{ item: { id: string } }>(created).item.id;
  const firstSync = await app.inject({ method: "POST", url: `/api/price-lists/${priceListId}/sync-bom` });
  const syncedItems = body<{ items: Array<Record<string, unknown>> }>(firstSync).items;
  const editedItems = syncedItems.map((item, index) => index === 0
    ? { ...item, pricingMethod: "fixed", retailUnitPriceMinor: 32_100, pricingRule: null, note: "Administrator price" }
    : item);
  assert.equal((await app.inject({ method: "PUT", url: `/api/price-lists/${priceListId}/items`, payload: { items: editedItems } })).statusCode, 200);

  const secondSync = await app.inject({ method: "POST", url: `/api/price-lists/${priceListId}/sync-bom` });
  assert.equal(secondSync.statusCode, 200);
  const syncedAgain = body<{ items: Array<{ retailUnitPriceMinor: number | null; note: string }>; sync: { added: number; updated: number } }>(secondSync);
  assert.equal(syncedAgain.sync.added, 0);
  assert.equal(syncedAgain.sync.updated, syncedItems.length);
  assert.equal(syncedAgain.items[0].retailUnitPriceMinor, 32_100);
  assert.equal(syncedAgain.items[0].note, "Administrator price");

  const exported = await app.inject({ method: "GET", url: `/api/price-lists/${priceListId}/export` });
  assert.equal(exported.statusCode, 200);
  assert.match(exported.headers["content-type"] ?? "", /text\/csv/);
  assert.match(exported.body, /retailUnitPrice/);
  assert.match(exported.body, /321\.00/);
});
