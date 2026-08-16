import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAE/wJ/lJ6sWQAAAABJRU5ErkJggg==";

function body<T>(response: { body: string }): T {
  return JSON.parse(response.body) as T;
}

async function createPricedQuote(app: FastifyInstance, suffix: string, previewDataUrl?: string) {
  const versionResponse = await app.inject({
    method: "POST",
    url: "/api/designs/design-demo/versions",
    headers: { "idempotency-key": `version-${suffix}` },
    payload: { note: `workflow-${suffix}` }
  });
  assert.equal(versionResponse.statusCode, 201);
  const designVersionId = body<{ item: { id: string } }>(versionResponse).item.id;
  const quoteResponse = await app.inject({
    method: "POST",
    url: "/api/quotes",
    headers: { "idempotency-key": `quote-${suffix}` },
    payload: {
      projectId: "project-demo",
      customerId: "customer-demo",
      designVersionId,
      currency: "CNY",
      discountMinor: 0,
      taxRateBasisPoints: 0,
      ...(previewDataUrl === undefined ? {} : { previewDataUrl })
    }
  });
  assert.equal(quoteResponse.statusCode, 201);
  return body<{
    item: { id: string; status: string; revision: number; totalMinor: number; snapshot: Record<string, unknown> };
  }>(quoteResponse).item;
}

async function transition(
  app: FastifyInstance,
  entity: "quotes" | "orders",
  id: string,
  revision: number,
  to: string,
  key: string
) {
  return app.inject({
    method: "POST",
    url: `/api/${entity}/${id}/transitions`,
    headers: { "if-match": String(revision), "idempotency-key": key },
    payload: { to }
  });
}

test("new headquarters quotes retain the 1.0 baseline and default to the 1.50 multiplier", async (context) => {
  const app = await buildApp({ ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" });
  context.after(() => app.close());

  const quote = await createPricedQuote(app, "suggested-retail");
  const response = await app.inject({ method: "GET", url: `/api/quotes/${quote.id}` });
  assert.equal(response.statusCode, 200);
  const item = body<{
    item: {
      totalMinor: number;
      basePriceTotalMinor: number | null;
      salesMultiplierBasisPoints: number | null;
      multiplierQuoteTotalMinor: number | null;
      snapshot: { quoteTerms?: { pricingAuthority?: string; suggestedRetailTotalMinor?: number } };
    };
  }>(response).item;

  assert.equal(item.snapshot.quoteTerms?.pricingAuthority, "server");
  assert.equal(item.snapshot.quoteTerms?.suggestedRetailTotalMinor, item.basePriceTotalMinor);
  assert.equal(item.salesMultiplierBasisPoints, 15_000);
  assert.equal(item.multiplierQuoteTotalMinor, Math.round((item.basePriceTotalMinor ?? 0) * 1.5));
  assert.equal(item.totalMinor, item.multiplierQuoteTotalMinor);
});

test("saved sales multiplier is frozen into the quote and the converted order", async (context) => {
  const app = await buildApp({ ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" });
  context.after(() => app.close());

  const preference = await app.inject({
    method: "PUT",
    url: "/api/me/sales-pricing-preferences",
    payload: { salesMultiplierBasisPoints: 17500 }
  });
  assert.equal(preference.statusCode, 200);

  const quote = await createPricedQuote(app, "saved-multiplier");
  const quoteTerms = quote.snapshot.quoteTerms as { salesMultiplierBasisPoints?: number; basePriceTotalMinor?: number } | undefined;
  assert.equal(quoteTerms?.salesMultiplierBasisPoints, 17500);
  assert.equal(quote.totalMinor, Math.round((quoteTerms?.basePriceTotalMinor ?? 0) * 1.75));

  const submittedResponse = await transition(app, "quotes", quote.id, quote.revision, "submitted", "saved-multiplier-submit");
  const submitted = body<{ item: { revision: number } }>(submittedResponse).item;
  const approvedResponse = await transition(app, "quotes", quote.id, submitted.revision, "approved", "saved-multiplier-approve");
  const approved = body<{ item: { revision: number } }>(approvedResponse).item;
  const confirmedResponse = await transition(app, "quotes", quote.id, approved.revision, "customer_confirmed", "saved-multiplier-confirm");
  const confirmed = body<{ item: { revision: number } }>(confirmedResponse).item;
  const orderResponse = await app.inject({
    method: "POST",
    url: "/api/orders",
    headers: { "idempotency-key": "saved-multiplier-order" },
    payload: { acceptedQuoteId: quote.id }
  });
  assert.equal(orderResponse.statusCode, 201);
  const order = body<{ item: { snapshot: { quote: { snapshot: { quoteTerms?: { salesMultiplierBasisPoints?: number } } } } } }>(orderResponse).item;
  assert.equal(order.snapshot.quote.snapshot.quoteTerms?.salesMultiplierBasisPoints, 17500);
  void confirmed;
});

test("quote creation rejects malformed inline preview images", async (context) => {
  const app = await buildApp({ ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" });
  context.after(() => app.close());

  const versionResponse = await app.inject({
    method: "POST",
    url: "/api/designs/design-demo/versions",
    headers: { "idempotency-key": "version-invalid-preview" },
    payload: { note: "invalid-preview" }
  });
  const designVersionId = body<{ item: { id: string } }>(versionResponse).item.id;
  const response = await app.inject({
    method: "POST",
    url: "/api/quotes",
    headers: { "idempotency-key": "quote-invalid-preview" },
    payload: {
      projectId: "project-demo",
      customerId: "customer-demo",
      designVersionId,
      previewDataUrl: "data:image/webp;base64,not-base64"
    }
  });

  assert.equal(response.statusCode, 422);
  assert.equal(body<{ error: { code: string } }>(response).error.code, "VALIDATION_ERROR");
});

test("order creation can freeze a current 3D preview without changing the quote", async (context) => {
  const app = await buildApp({ ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" });
  context.after(() => app.close());

  const quote = await createPricedQuote(app, "order-preview-override");
  const submittedResponse = await transition(app, "quotes", quote.id, quote.revision, "submitted", "order-preview-submit");
  const submitted = body<{ item: { revision: number } }>(submittedResponse).item;
  const approvedResponse = await transition(app, "quotes", quote.id, submitted.revision, "approved", "order-preview-approve");
  const approved = body<{ item: { revision: number } }>(approvedResponse).item;
  const confirmedResponse = await transition(app, "quotes", quote.id, approved.revision, "customer_confirmed", "order-preview-confirm");
  assert.equal(confirmedResponse.statusCode, 200);

  const orderResponse = await app.inject({
    method: "POST",
    url: "/api/orders",
    headers: { "idempotency-key": "order-preview-override" },
    payload: { acceptedQuoteId: quote.id, previewDataUrl: TINY_PNG_DATA_URL }
  });
  assert.equal(orderResponse.statusCode, 201);
  const order = body<{ item: { snapshot: Record<string, unknown> } }>(orderResponse).item;
  const frozenQuote = order.snapshot.quote as { snapshot?: Record<string, unknown> };
  assert.equal(frozenQuote.snapshot?.previewDataUrl, TINY_PNG_DATA_URL);

  const quoteResponse = await app.inject({ method: "GET", url: `/api/quotes/${quote.id}` });
  const currentQuote = body<{ item: { snapshot: Record<string, unknown> } }>(quoteResponse).item;
  assert.equal(currentQuote.snapshot.previewDataUrl, null);
});

test("approved quote converts once and order ships through the controlled workflow", async (context) => {
  const app = await buildApp({ ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" });
  context.after(() => app.close());

  const quote = await createPricedQuote(app, "complete", TINY_PNG_DATA_URL);
  assert.equal(quote.status, "priced");
  assert.equal(quote.snapshot.previewDataUrl, TINY_PNG_DATA_URL);
  const quoteListResponse = await app.inject({ method: "GET", url: "/api/quotes" });
  const listedQuote = body<{ items: Array<{ id: string; snapshot: Record<string, unknown> }> }>(quoteListResponse)
    .items.find((item) => item.id === quote.id);
  assert.equal(listedQuote?.snapshot.previewDataUrl, undefined);

  const invalidApproval = await transition(app, "quotes", quote.id, quote.revision, "approved", "quote-invalid-approval");
  assert.equal(invalidApproval.statusCode, 409);
  assert.equal(body<{ error: { code: string } }>(invalidApproval).error.code, "INVALID_TRANSITION");

  const submittedResponse = await transition(app, "quotes", quote.id, quote.revision, "submitted", "quote-submit");
  assert.equal(submittedResponse.statusCode, 200);
  const submitted = body<{ item: { status: string; revision: number } }>(submittedResponse).item;
  assert.equal(submitted.status, "submitted");

  const submittedReplay = await transition(app, "quotes", quote.id, quote.revision, "submitted", "quote-submit");
  assert.equal(submittedReplay.headers["idempotency-replayed"], "true");
  assert.equal(body<{ item: { revision: number } }>(submittedReplay).item.revision, submitted.revision);

  const approvedResponse = await transition(app, "quotes", quote.id, submitted.revision, "approved", "quote-approve");
  const approved = body<{ item: { status: string; revision: number } }>(approvedResponse).item;
  assert.equal(approved.status, "approved");

  const confirmedResponse = await transition(app, "quotes", quote.id, approved.revision, "customer_confirmed", "quote-customer-confirm");
  const confirmed = body<{ item: { status: string; revision: number } }>(confirmedResponse).item;
  assert.equal(confirmed.status, "customer_confirmed");

  const directConversion = await transition(app, "quotes", quote.id, confirmed.revision, "converted", "quote-direct-convert");
  assert.equal(directConversion.statusCode, 409);
  assert.equal(body<{ error: { code: string } }>(directConversion).error.code, "INVALID_TRANSITION");

  const orderPayload = { acceptedQuoteId: quote.id, productionNote: "workflow test" };
  const orderResponse = await app.inject({
    method: "POST",
    url: "/api/orders",
    headers: { "idempotency-key": "order-from-confirmed-quote" },
    payload: orderPayload
  });
  assert.equal(orderResponse.statusCode, 201);
  const order = body<{
    item: { id: string; status: string; revision: number; snapshot: Record<string, unknown> };
  }>(orderResponse).item;
  assert.equal(order.status, "draft");
  const frozenQuote = order.snapshot.quote as { snapshot?: Record<string, unknown> };
  assert.equal(frozenQuote.snapshot?.previewDataUrl, TINY_PNG_DATA_URL);
  const orderListResponse = await app.inject({ method: "GET", url: "/api/orders" });
  const listedOrder = body<{ items: Array<{ id: string; snapshot: Record<string, unknown> }> }>(orderListResponse)
    .items.find((item) => item.id === order.id);
  const listedFrozenQuote = listedOrder?.snapshot.quote as { snapshot?: Record<string, unknown> } | undefined;
  assert.equal(listedFrozenQuote?.snapshot?.previewDataUrl, undefined);
  const auditResponse = await app.inject({ method: "GET", url: `/api/audit-logs?entityId=${order.id}` });
  assert.doesNotMatch(auditResponse.body, /previewDataUrl/);

  const orderReplay = await app.inject({
    method: "POST",
    url: "/api/orders",
    headers: { "idempotency-key": "order-from-confirmed-quote" },
    payload: orderPayload
  });
  assert.equal(orderReplay.headers["idempotency-replayed"], "true");
  assert.equal(body<{ item: { id: string } }>(orderReplay).item.id, order.id);

  const convertedQuoteResponse = await app.inject({ method: "GET", url: `/api/quotes/${quote.id}` });
  assert.equal(body<{ item: { status: string } }>(convertedQuoteResponse).item.status, "converted");

  let currentRevision = order.revision;
  const orderPath = [
    "confirmed",
    "ready_for_production",
    "in_production",
    "ready_to_ship",
    "shipped"
  ];
  for (const [index, status] of orderPath.entries()) {
    const response = await transition(app, "orders", order.id, currentRevision, status, `order-${index}-${status}`);
    assert.equal(response.statusCode, 200);
    const item = body<{ item: { status: string; revision: number } }>(response).item;
    assert.equal(item.status, status);
    currentRevision = item.revision;
  }

  const shippedResponse = await app.inject({ method: "GET", url: `/api/orders/${order.id}` });
  assert.equal(body<{ item: { status: string } }>(shippedResponse).item.status, "shipped");

  const deliveredResponse = await transition(app, "orders", order.id, currentRevision, "delivered", "order-invalid-delivered");
  assert.equal(deliveredResponse.statusCode, 409);
  assert.equal(body<{ error: { code: string } }>(deliveredResponse).error.code, "INVALID_TRANSITION");
});
