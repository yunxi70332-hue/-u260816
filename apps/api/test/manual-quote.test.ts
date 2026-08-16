import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

function body<T>(response: { body: string }): T {
  return JSON.parse(response.body) as T;
}

test("project quote uses the published retail price as a baseline and audits manual adjustments", async (context) => {
  const app = await buildApp({ ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" });
  context.after(() => app.close());

  const designResponse = await app.inject({ method: "GET", url: "/api/designs/design-demo" });
  assert.equal(designResponse.statusCode, 200);
  const configSnapshot = body<{ item: { configSnapshot: Record<string, unknown> } }>(designResponse).item.configSnapshot;

  const projectResponse = await app.inject({
    method: "POST",
    url: "/api/projects",
    headers: { "idempotency-key": "manual-quote-project" },
    payload: { name: "Manual quote project", customerId: "customer-demo" }
  });
  assert.equal(projectResponse.statusCode, 201);
  const project = body<{ item: { id: string } }>(projectResponse).item;

  const createDesignResponse = await app.inject({
    method: "POST",
    url: "/api/designs",
    headers: { "idempotency-key": "manual-quote-design" },
    payload: { projectId: project.id, name: "Manual quote design", configSnapshot }
  });
  assert.equal(createDesignResponse.statusCode, 201);

  const createQuoteResponse = await app.inject({
    method: "POST",
    url: `/api/projects/${project.id}/quote`,
    headers: { "idempotency-key": "manual-quote-create" },
    payload: {
      manualTotalMinor: 12345,
      adjustmentReason: "Approved campaign pricing",
      notes: "  Include material samples with delivery  "
    }
  });
  assert.equal(createQuoteResponse.statusCode, 201);
  const created = body<{
    item: {
      id: string;
      revision: number;
      totalMinor: number;
      basePriceTotalMinor: number | null;
      salesMultiplierBasisPoints: number | null;
      multiplierQuoteTotalMinor: number | null;
      notes: string | null;
      snapshot: Record<string, unknown>;
    };
  }>(createQuoteResponse).item;
  assert.equal(created.totalMinor, 12345);
  assert.ok((created.basePriceTotalMinor ?? 0) > 0);
  assert.equal(created.salesMultiplierBasisPoints, 15_000);
  assert.equal(created.multiplierQuoteTotalMinor, Math.round((created.basePriceTotalMinor ?? 0) * 1.5));
  assert.equal(created.notes, "Include material samples with delivery");
  const terms = created.snapshot.quoteTerms as Record<string, unknown>;
  assert.equal(terms.pricingAuthority, "manual");
  assert.equal(terms.manualTotalMinor, 12345);
  assert.equal(terms.adjustmentReason, "Approved campaign pricing");
  assert.ok(Number(terms.suggestedRetailTotalMinor) > 0);

  const projectListResponse = await app.inject({ method: "GET", url: "/api/projects" });
  assert.equal(projectListResponse.statusCode, 200);
  const listed = body<{
    items: Array<{
      id: string;
      quoteTotalMinor: number | null;
      suggestedRetailTotalMinor: number | null;
      quoteSource: string | null;
      quoteId: string | null;
      quoteEditable: boolean;
      quoteNote: string | null;
    }>;
  }>(projectListResponse).items.find((item) => item.id === project.id);
  assert.ok(listed);
  assert.equal(listed.quoteTotalMinor, 12345);
  assert.equal(listed.quoteSource, "manual");
  assert.equal(listed.quoteId, created.id);
  assert.equal(listed.quoteEditable, true);
  assert.equal(listed.quoteNote, "Include material samples with delivery");
  assert.ok((listed.suggestedRetailTotalMinor ?? 0) > 0);

  const missingReasonResponse = await app.inject({
    method: "PATCH",
    url: `/api/quotes/${created.id}`,
    headers: { "if-match": String(created.revision) },
    payload: { manualTotalMinor: 13000 }
  });
  assert.equal(missingReasonResponse.statusCode, 422);

  const updateResponse = await app.inject({
    method: "PATCH",
    url: `/api/quotes/${created.id}`,
    headers: { "if-match": String(created.revision) },
    payload: {
      manualTotalMinor: 13000,
      adjustmentReason: "Customer confirmed revised scope",
      notes: "Add a small gift for the customer"
    }
  });
  assert.equal(updateResponse.statusCode, 200);
  const updated = body<{ item: { totalMinor: number; revision: number; notes: string | null } }>(updateResponse).item;
  assert.equal(updated.totalMinor, 13000);
  assert.equal(updated.notes, "Add a small gift for the customer");

  const auditResponse = await app.inject({
    method: "GET",
    url: `/api/audit-logs?entityType=quote&entityId=${created.id}`
  });
  assert.equal(auditResponse.statusCode, 200);
  const audits = body<{
    items: Array<{ action: string; metadata: Record<string, unknown>; actorName: string | null }>;
  }>(auditResponse).items.filter((item) => item.action === "quote.updated");
  assert.equal(audits.length, 1);
  assert.equal(audits[0].metadata.previousTotalMinor, 12345);
  assert.equal(audits[0].metadata.finalQuoteTotalMinor, 13000);
  assert.equal(audits[0].metadata.adjustmentReason, "Customer confirmed revised scope");
  assert.equal(audits[0].metadata.quoteNote, "Add a small gift for the customer");
  assert.equal(typeof audits[0].actorName, "string");

  const historyResponse = await app.inject({ method: "GET", url: `/api/projects/${project.id}/quote-history` });
  assert.equal(historyResponse.statusCode, 200);
  const history = body<{ items: Array<{ action: string; metadata: Record<string, unknown> }> }>(historyResponse).items;
  assert.equal(history.filter((item) => item.action === "quote.created" || item.action === "quote.updated").length, 2);

  const createdAudits = body<{
    items: Array<{ action: string; metadata: Record<string, unknown> }>;
  }>(auditResponse).items.filter((item) => item.action === "quote.created");
  assert.equal(createdAudits.length, 1);
  assert.equal(createdAudits[0].metadata.quoteNote, "Include material samples with delivery");
});
