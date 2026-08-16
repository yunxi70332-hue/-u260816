import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import {
  beijingDateKey,
  calculateExpectedDeliveryDate
} from "../src/services/delivery-schedule.js";

function body<T>(response: { body: string }): T {
  return JSON.parse(response.body) as T;
}

test("delivery calculations use Beijing calendar days across UTC date boundaries", () => {
  const beforeBeijingMidnight = "2026-08-14T15:59:59.999Z";
  const atBeijingMidnight = "2026-08-14T16:00:00.000Z";

  assert.equal(beijingDateKey(beforeBeijingMidnight), "2026-08-14");
  assert.equal(beijingDateKey(atBeijingMidnight), "2026-08-15");
  assert.equal(calculateExpectedDeliveryDate(beforeBeijingMidnight, 30), "2026-09-13");
  assert.equal(calculateExpectedDeliveryDate(atBeijingMidnight, 30), "2026-09-14");
  assert.equal(calculateExpectedDeliveryDate("2026-12-31T15:59:59.999Z", 1), "2027-01-01");
});

test("updating an order delivery schedule preserves the customer confirmation date and audits the new commitment", async (context) => {
  const app = await buildApp({ ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" });
  context.after(() => app.close());

  const initialResponse = await app.inject({ method: "GET", url: "/api/orders/order-demo" });
  assert.equal(initialResponse.statusCode, 200);
  const initial = body<{
    item: {
      id: string;
      revision: number;
      customerConfirmedAt: string;
      deliveryLeadTimeDays: number;
      expectedDeliveryDate: string;
    };
  }>(initialResponse).item;

  assert.equal(initial.deliveryLeadTimeDays, 30);
  assert.equal(
    initial.expectedDeliveryDate,
    calculateExpectedDeliveryDate(initial.customerConfirmedAt, initial.deliveryLeadTimeDays)
  );

  const updateResponse = await app.inject({
    method: "PATCH",
    url: `/api/orders/${initial.id}/delivery-schedule`,
    headers: { "if-match": String(initial.revision) },
    payload: { deliveryLeadTimeDays: 45 }
  });
  assert.equal(updateResponse.statusCode, 200);
  const updated = body<{
    item: {
      revision: number;
      customerConfirmedAt: string;
      deliveryLeadTimeDays: number;
      expectedDeliveryDate: string;
    };
  }>(updateResponse).item;

  assert.equal(updated.revision, initial.revision + 1);
  assert.equal(updateResponse.headers.etag, `W/"${updated.revision}"`);
  assert.equal(updated.customerConfirmedAt, initial.customerConfirmedAt);
  assert.equal(updated.deliveryLeadTimeDays, 45);
  assert.equal(updated.expectedDeliveryDate, calculateExpectedDeliveryDate(initial.customerConfirmedAt, 45));

  const detailResponse = await app.inject({ method: "GET", url: `/api/orders/${initial.id}` });
  assert.equal(detailResponse.statusCode, 200);
  const persisted = body<{
    item: { revision: number; deliveryLeadTimeDays: number; expectedDeliveryDate: string };
  }>(detailResponse).item;
  assert.equal(persisted.revision, updated.revision);
  assert.equal(persisted.deliveryLeadTimeDays, 45);
  assert.equal(persisted.expectedDeliveryDate, updated.expectedDeliveryDate);

  const auditResponse = await app.inject({
    method: "GET",
    url: `/api/audit-logs?entityType=order&entityId=${initial.id}`
  });
  assert.equal(auditResponse.statusCode, 200);
  const audits = body<{
    items: Array<{ action: string; metadata: Record<string, unknown> }>;
  }>(auditResponse).items.filter((item) => item.action === "order.delivery_schedule_changed");

  assert.equal(audits.length, 1);
  assert.equal(audits[0].metadata.customerConfirmedAt, initial.customerConfirmedAt);
  assert.equal(audits[0].metadata.previousDeliveryLeadTimeDays, 30);
  assert.equal(audits[0].metadata.deliveryLeadTimeDays, 45);
  assert.equal(audits[0].metadata.expectedDeliveryDate, updated.expectedDeliveryDate);
});
