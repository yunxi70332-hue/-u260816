import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { MemoryRepository } from "../src/memory-repository.js";

interface QuoteResponse {
  id: string;
  status: string;
  revision: number;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  basePriceTotalMinor: number | null;
  salesMultiplierBasisPoints: number | null;
  multiplierQuoteTotalMinor: number | null;
  lines: Array<{ metadata: Record<string, unknown> }>;
  snapshot: Record<string, unknown>;
}

function body<T>(response: { body: string }): T {
  return JSON.parse(response.body) as T;
}

function record(value: unknown): Record<string, unknown> {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}

function records(value: unknown): Array<Record<string, unknown>> {
  assert.ok(Array.isArray(value));
  return value.map(record);
}

class DealerQuoteRepository extends MemoryRepository {
  override async getDealerForOrganization(organizationId: string) {
    if (organizationId === "tenant-demo") {
      return (await this.listDealers("tenant-demo")).find((dealer) => dealer.id === "dealer-demo") ?? null;
    }
    return super.getDealerForOrganization(organizationId);
  }
}

class PendingPricingRepository extends MemoryRepository {
  override async listPriceListItems(tenantId: string, priceListId: string) {
    const items = await super.listPriceListItems(tenantId, priceListId);
    return items.filter((item) => item.materialKey !== "expansionSet");
  }
}

async function transitionQuote(app: FastifyInstance, quote: QuoteResponse, to: string, key: string): Promise<QuoteResponse> {
  const response = await app.inject({
    method: "POST",
    url: `/api/quotes/${quote.id}/transitions`,
    headers: { "if-match": String(quote.revision), "idempotency-key": key },
    payload: { to }
  });
  assert.equal(response.statusCode, 200);
  return body<{ item: QuoteResponse }>(response).item;
}

test("quote pricing snapshot stays synchronized and freezes dealer settlement terms into the order", async (context) => {
  const repository = new DealerQuoteRepository();
  const app = await buildApp(
    { ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" },
    { repository }
  );
  context.after(() => app.close());

  const versionResponse = await app.inject({
    method: "POST",
    url: "/api/designs/design-demo/versions",
    headers: { "idempotency-key": "quote-snapshot-version" },
    payload: { note: "quote snapshot test" }
  });
  assert.equal(versionResponse.statusCode, 201);
  const designVersionId = body<{ item: { id: string } }>(versionResponse).item.id;

  const createResponse = await app.inject({
    method: "POST",
    url: "/api/quotes",
    headers: { "idempotency-key": "quote-snapshot-create" },
    payload: {
      projectId: "project-demo",
      customerId: "customer-demo",
      designVersionId,
      currency: "CNY",
      discountMinor: 0,
      taxRateBasisPoints: 0
    }
  });
  assert.equal(createResponse.statusCode, 201);
  const created = body<{ item: QuoteResponse }>(createResponse).item;
  assert.ok(created.lines.length > 0);
  assert.ok(created.lines.every((line) => typeof line.metadata.materialKey === "string" && typeof line.metadata.specKey === "string"));

  const createdDealerPricing = record(created.snapshot.dealerPricing);
  assert.equal(createdDealerPricing.settlementRatePercent, 85);
  assert.equal(createdDealerPricing.retailTotalMinor, created.basePriceTotalMinor);
  assert.equal(createdDealerPricing.purchaseTotalMinor, Math.round((created.basePriceTotalMinor ?? 0) * 85 / 100));
  assert.equal(
    records(createdDealerPricing.lines).reduce((sum, line) => sum + Number(line.dealerLineTotalMinor), 0),
    createdDealerPricing.purchaseTotalMinor
  );

  const rateResponse = await app.inject({
    method: "PATCH",
    url: "/api/dealers/dealer-demo/settlement-rate",
    payload: { settlementRatePercent: 88 }
  });
  assert.equal(rateResponse.statusCode, 200);

  const discountMinor = 1_000;
  const taxRateBasisPoints = 1_300;
  const discountedMinor = created.subtotalMinor - discountMinor;
  const expectedTaxMinor = Math.round(discountedMinor * taxRateBasisPoints / 10_000);
  const expectedBasePriceTotalMinor = discountedMinor + expectedTaxMinor;
  const expectedTotalMinor = Math.round(expectedBasePriceTotalMinor * 1.5);
  const updateResponse = await app.inject({
    method: "PATCH",
    url: `/api/quotes/${created.id}`,
    headers: { "if-match": String(created.revision) },
    payload: { discountMinor, taxRateBasisPoints }
  });
  assert.equal(updateResponse.statusCode, 200);
  const updated = body<{ item: QuoteResponse }>(updateResponse).item;
  assert.equal(updated.discountMinor, discountMinor);
  assert.equal(updated.taxMinor, expectedTaxMinor);
  assert.equal(updated.basePriceTotalMinor, expectedBasePriceTotalMinor);
  assert.equal(updated.salesMultiplierBasisPoints, 15_000);
  assert.equal(updated.totalMinor, expectedTotalMinor);

  const calculation = record(updated.snapshot.calculation);
  assert.equal(calculation.subtotalMinor, updated.subtotalMinor);
  assert.equal(calculation.discountMinor, discountMinor);
  assert.equal(calculation.taxMinor, expectedTaxMinor);
  assert.equal(calculation.totalMinor, expectedTotalMinor);
  assert.equal(calculation.currency, "CNY");

  const updatedDealerPricing = record(updated.snapshot.dealerPricing);
  assert.equal(updatedDealerPricing.settlementRatePercent, 85);
  assert.equal(updatedDealerPricing.retailTotalMinor, expectedBasePriceTotalMinor);
  assert.equal(updatedDealerPricing.purchaseTotalMinor, Math.round(expectedBasePriceTotalMinor * 85 / 100));
  const updatedDealerLines = records(updatedDealerPricing.lines);
  assert.equal(
    updatedDealerLines.reduce((sum, line) => sum + Number(line.retailLineTotalMinor), 0),
    expectedBasePriceTotalMinor
  );
  assert.equal(
    updatedDealerLines.reduce((sum, line) => sum + Number(line.dealerLineTotalMinor), 0),
    updatedDealerPricing.purchaseTotalMinor
  );

  const sent = await transitionQuote(app, updated, "sent", "quote-snapshot-sent");
  const accepted = await transitionQuote(app, sent, "accepted", "quote-snapshot-accepted");
  const orderResponse = await app.inject({
    method: "POST",
    url: "/api/orders",
    headers: { "idempotency-key": "quote-snapshot-order" },
    payload: { acceptedQuoteId: accepted.id }
  });
  assert.equal(orderResponse.statusCode, 201);
  const order = body<{ item: { totalMinor: number; snapshot: Record<string, unknown> } }>(orderResponse).item;
  assert.equal(order.totalMinor, expectedTotalMinor);
  const frozenQuote = record(order.snapshot.quote);
  assert.equal(frozenQuote.totalMinor, expectedTotalMinor);
  const frozenQuoteSnapshot = record(frozenQuote.snapshot);
  assert.deepEqual(frozenQuoteSnapshot.calculation, updated.snapshot.calculation);
  assert.deepEqual(frozenQuoteSnapshot.dealerPricing, updated.snapshot.dealerPricing);
});

test("pending public pricing records a failure audit without storing the configurator payload", async (context) => {
  const repository = new PendingPricingRepository();
  const app = await buildApp(
    { ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" },
    { repository }
  );
  context.after(() => app.close());

  const designResponse = await app.inject({ method: "GET", url: "/api/designs/design-demo" });
  assert.equal(designResponse.statusCode, 200);
  const configSnapshot = body<{ item: { configSnapshot: Record<string, unknown> } }>(designResponse).item.configSnapshot;
  const pricingResponse = await app.inject({
    method: "POST",
    url: "/api/pricing/calculate",
    payload: { configSnapshot, market: "中国大陆", currency: "CNY" }
  });
  assert.equal(pricingResponse.statusCode, 200);
  assert.equal(body<{ status: string }>(pricingResponse).status, "pending");

  const auditResponse = await app.inject({ method: "GET", url: "/api/audit-logs?entityType=pricing_calculation" });
  assert.equal(auditResponse.statusCode, 200);
  const audits = body<{ items: Array<Record<string, unknown>> }>(auditResponse).items;
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, "pricing.calculation_failed");
  const metadata = record(audits[0].metadata);
  assert.equal(metadata.status, "pending");
  assert.ok(Number(metadata.unmatchedCount) > 0);
  assert.ok(Number(metadata.latencyMs) >= 0);
  assert.equal("configSnapshot" in metadata, false);
  assert.equal("bom" in metadata, false);
});
