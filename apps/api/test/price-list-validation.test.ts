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

test("price import previews and commits existing rows while rejecting unknown identities", async (context) => {
  const app = await buildApp({ ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" });
  context.after(() => app.close());
  const { priceListId, items } = await createSyncedDraft(app, "import");
  const current = items.find((item) => item.pricingMethod === "fixed" && typeof item.retailUnitPriceMinor === "number") as {
    materialKey: string; specKey: string; retailUnitPriceMinor: number;
  } | undefined;
  assert.ok(current);

  const previewResponse = await app.inject({
    method: "POST",
    url: `/api/price-lists/${priceListId}/import/preview`,
    payload: { rows: [{ materialKey: current.materialKey, specKey: current.specKey, unitPrice: current.retailUnitPriceMinor / 100 + 1 }] }
  });
  assert.equal(previewResponse.statusCode, 200);
  const preview = body<{ previewToken: string; counts: { updated: number; error: number; conflict: number } }>(previewResponse);
  assert.equal(preview.counts.updated, 1);
  assert.equal(preview.counts.error, 0);
  assert.equal(preview.counts.conflict, 0);

  const commitResponse = await app.inject({
    method: "POST",
    url: `/api/price-lists/${priceListId}/import/commit`,
    payload: { previewToken: preview.previewToken, rows: [{ materialKey: current.materialKey, specKey: current.specKey, unitPrice: current.retailUnitPriceMinor / 100 + 1 }] }
  });
  assert.equal(commitResponse.statusCode, 200);
  const detail = body<{ items: Array<{ materialKey: string; specKey: string; retailUnitPriceMinor: number | null }> }>(await app.inject({ method: "GET", url: `/api/price-lists/${priceListId}` }));
  const updated = detail.items.find((item) => item.materialKey === current.materialKey && item.specKey === current.specKey);
  assert.equal(updated?.retailUnitPriceMinor, current.retailUnitPriceMinor + 100);

  const unknownPreview = await app.inject({
    method: "POST",
    url: `/api/price-lists/${priceListId}/import/preview`,
    payload: { rows: [{ materialKey: "unknown-material", specKey: "unknown-spec", unitPrice: 1 }] }
  });
  assert.equal(unknownPreview.statusCode, 200);
  assert.equal(body<{ counts: { error: number }; errors: string[] }>(unknownPreview).counts.error, 1);
  assert.ok(body<{ errors: string[] }>(unknownPreview).errors.some((message) => message.includes("Unknown material/spec")));
});

test("price import accepts formula rows without a numeric unit price", async (context) => {
  const app = await buildApp({ ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" });
  context.after(() => app.close());
  const { priceListId, items } = await createSyncedDraft(app, "formula-import");
  const current = items.find((item) => item.pricingMethod === "formula") as { materialKey: string; specKey: string } | undefined;
  assert.ok(current);
  const row = { materialKey: current.materialKey, specKey: current.specKey, pricingRule: { expression: "area * rate" } };

  const previewResponse = await app.inject({ method: "POST", url: `/api/price-lists/${priceListId}/import/preview`, payload: { rows: [row] } });
  assert.equal(previewResponse.statusCode, 200);
  const preview = body<{ previewToken: string; counts: { updated: number; error: number } }>(previewResponse);
  assert.equal(preview.counts.updated, 1);
  assert.equal(preview.counts.error, 0);

  const commitResponse = await app.inject({ method: "POST", url: `/api/price-lists/${priceListId}/import/commit`, payload: { rows: [row], previewToken: preview.previewToken } });
  assert.equal(commitResponse.statusCode, 200);
  const detail = body<{ items: Array<{ materialKey: string; specKey: string; pricingMethod: string; pricingRule: { expression?: string } | null }> }>(await app.inject({ method: "GET", url: `/api/price-lists/${priceListId}` }));
  const updated = detail.items.find((item) => item.materialKey === current.materialKey && item.specKey === current.specKey);
  assert.equal(updated?.pricingMethod, "formula");
  assert.equal(updated?.pricingRule?.expression, "area * rate");
});

test("price import normalizes human-readable dimension units on the server", async (context) => {
  const app = await buildApp({ ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" });
  context.after(() => app.close());
  const { priceListId, items } = await createSyncedDraft(app, "dimension-normalization");
  const current = items.find((item) => typeof item.specKey === "string" && /^\d+x\d+$/.test(item.specKey as string)) as {
    materialKey: string; specKey: string; retailUnitPriceMinor: number;
  } | undefined;
  assert.ok(current);
  const formattedSpec = `${current.specKey.replace("x", " × ")} mm`;

  const previewResponse = await app.inject({
    method: "POST",
    url: `/api/price-lists/${priceListId}/import/preview`,
    payload: { rows: [{ materialKey: current.materialKey, specKey: formattedSpec, unitPrice: current.retailUnitPriceMinor / 100 }] }
  });
  assert.equal(previewResponse.statusCode, 200);
  const preview = body<{ counts: { skipped: number; error: number } }>(previewResponse);
  assert.equal(preview.counts.skipped, 1);
  assert.equal(preview.counts.error, 0);
});
