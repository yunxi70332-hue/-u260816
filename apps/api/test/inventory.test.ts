import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { MemoryRepository } from "../src/memory-repository.js";

function body<T>(response: { body: string }): T {
  return JSON.parse(response.body) as T;
}

type Material = {
  id: string;
  materialKey: string;
  specKey: string;
  color: string;
  finish: string;
};

type Balance = Material & {
  warehouseId: string;
  materialId: string;
  onHandQty: number;
  reservedQty: number;
  availableQty: number;
};

async function balances(app: FastifyInstance): Promise<Balance[]> {
  const response = await app.inject({ method: "GET", url: "/api/inventory/balances" });
  assert.equal(response.statusCode, 200);
  return body<{ items: Balance[] }>(response).items;
}

function variant(items: Balance[], color: string, finish: string): Balance {
  const item = items.find((candidate) => candidate.color === color && candidate.finish === finish);
  assert.ok(item, `Expected ${color}/${finish} inventory variant`);
  return item;
}

async function createAndPostStockDocument(
  app: FastifyInstance,
  payload: {
    type: "receive" | "issue" | "adjust" | "transfer";
    warehouseId: string;
    lines: Array<{ materialId: string; materialKey: string; specKey: string; color: string; finish: string; qty: number }>;
    note?: string;
  }
) {
  const created = await app.inject({ method: "POST", url: "/api/stock-documents", payload });
  assert.equal(created.statusCode, 201);
  const document = body<{ item: { id: string; status: string } }>(created).item;
  assert.equal(document.status, "draft");

  const posted = await app.inject({ method: "POST", url: `/api/stock-documents/${document.id}/post` });
  return { document, posted };
}

test("opening stock, reservation, partial issue, negative-stock blocking, and reversal preserve inventory invariants", async (context) => {
  const repository = new MemoryRepository();
  const app = await buildApp(
    { ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" },
    { repository }
  );
  context.after(() => app.close());

  const imported = await app.inject({
    method: "POST",
    url: "/api/materials/import/commit",
    payload: {
      warehouseId: "warehouse-main",
      source: "inventory-domain-test",
      rows: [
        { materialKey: "TUBE", specKey: "750", color: "black", finish: "matte", name: "Tube black matte", openingQty: 10 },
        { materialKey: "TUBE", specKey: "750", color: "black", finish: "gloss", name: "Tube black gloss", openingQty: 7 },
        { materialKey: "TUBE", specKey: "750", color: "white", finish: "matte", name: "Tube white matte", openingQty: 4 }
      ]
    }
  });
  assert.equal(imported.statusCode, 201);
  const opening = body<{ materials: Material[]; openingDocument: { id: string; status: string } }>(imported);
  assert.equal(opening.openingDocument.status, "posted");

  let current = await balances(app);
  const blackMatte = variant(current, "black", "matte");
  assert.deepEqual(
    current.map((item) => [item.color, item.finish, item.onHandQty, item.reservedQty, item.availableQty]).sort(),
    [
      ["black", "gloss", 7, 0, 7],
      ["black", "matte", 10, 0, 10],
      ["white", "matte", 4, 0, 4]
    ]
  );

  const reserved = await app.inject({
    method: "POST",
    url: "/api/orders/order-demo/material-reservation",
    payload: {
      warehouseId: "warehouse-main",
      requirements: [{
        materialId: blackMatte.materialId,
        materialKey: blackMatte.materialKey,
        specKey: blackMatte.specKey,
        color: blackMatte.color,
        finish: blackMatte.finish,
        qty: 3
      }]
    }
  });
  assert.equal(reserved.statusCode, 201);
  assert.equal(body<{ items: Array<{ qty: number; status: string }> }>(reserved).items[0]?.status, "active");
  assert.equal(body<{ items: Array<{ qty: number }> }>(reserved).items[0]?.qty, 3);

  current = await balances(app);
  assert.deepEqual(
    (({ onHandQty, reservedQty, availableQty }) => ({ onHandQty, reservedQty, availableQty }))(variant(current, "black", "matte")),
    { onHandQty: 10, reservedQty: 3, availableQty: 7 }
  );

  const partialIssue = await createAndPostStockDocument(app, {
    type: "issue",
    warehouseId: "warehouse-main",
    note: "partial outbound",
    lines: [{
      materialId: blackMatte.materialId,
      materialKey: blackMatte.materialKey,
      specKey: blackMatte.specKey,
      color: blackMatte.color,
      finish: blackMatte.finish,
      qty: 4
    }]
  });
  assert.equal(partialIssue.posted.statusCode, 200);
  assert.equal(body<{ item: { status: string } }>(partialIssue.posted).item.status, "posted");

  current = await balances(app);
  assert.deepEqual(
    (({ onHandQty, reservedQty, availableQty }) => ({ onHandQty, reservedQty, availableQty }))(variant(current, "black", "matte")),
    { onHandQty: 6, reservedQty: 3, availableQty: 3 }
  );
  assert.equal(variant(current, "black", "gloss").onHandQty, 7);
  assert.equal(variant(current, "white", "matte").onHandQty, 4);

  const blockedIssue = await createAndPostStockDocument(app, {
    type: "issue",
    warehouseId: "warehouse-main",
    lines: [{
      materialId: blackMatte.materialId,
      materialKey: blackMatte.materialKey,
      specKey: blackMatte.specKey,
      color: blackMatte.color,
      finish: blackMatte.finish,
      qty: 4
    }]
  });
  assert.equal(blockedIssue.posted.statusCode, 409);
  assert.equal(body<{ error: { code: string; details: { availableQty: number; requestedQty: number } } }>(blockedIssue.posted).error.code, "VALIDATION_ERROR");
  assert.deepEqual(body<{ error: { details: { availableQty: number; requestedQty: number } } }>(blockedIssue.posted).error.details, {
    availableQty: 3,
    requestedQty: 4
  });
  assert.equal(variant(await balances(app), "black", "matte").onHandQty, 6);

  const reversed = await app.inject({
    method: "POST",
    url: `/api/stock-documents/${partialIssue.document.id}/reverse`
  });
  assert.equal(reversed.statusCode, 200);
  assert.equal(body<{ item: { status: string } }>(reversed).item.status, "reversed");

  const released = await app.inject({
    method: "POST",
    url: "/api/orders/order-demo/material-reservation/release"
  });
  assert.equal(released.statusCode, 200);
  assert.equal(body<{ items: Array<{ status: string }> }>(released).items[0]?.status, "released");

  current = await balances(app);
  assert.deepEqual(
    (({ onHandQty, reservedQty, availableQty }) => ({ onHandQty, reservedQty, availableQty }))(variant(current, "black", "matte")),
    { onHandQty: 10, reservedQty: 0, availableQty: 10 }
  );

  const ledgerResponse = await app.inject({
    method: "GET",
    url: `/api/inventory/ledger?warehouseId=warehouse-main&materialId=${blackMatte.materialId}`
  });
  assert.equal(ledgerResponse.statusCode, 200);
  const directions = body<{ items: Array<{ direction: string; deltaQty: number }> }>(ledgerResponse).items;
  assert.deepEqual(directions.map((item) => item.direction), ["release", "reverse", "issue", "reserve", "receive"]);
  assert.deepEqual(directions.map((item) => item.deltaQty), [0, 4, -4, 0, 10]);
});

test("partial order material issue consumes only issued reservation quantity and cancellation releases the remainder", async (context) => {
  const repository = new MemoryRepository();
  const app = await buildApp(
    { ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" },
    { repository }
  );
  context.after(() => app.close());

  const imported = await app.inject({
    method: "POST",
    url: "/api/materials/import/commit",
    payload: {
      warehouseId: "warehouse-main",
      source: "partial-order-issue-test",
      rows: [{ materialKey: "TUBE", specKey: "750", color: "black", finish: "matte", name: "Tube black matte", openingQty: 10 }]
    }
  });
  assert.equal(imported.statusCode, 201);
  const material = variant(await balances(app), "black", "matte");
  const requirement = {
    materialId: material.materialId,
    materialKey: material.materialKey,
    specKey: material.specKey,
    color: material.color,
    finish: material.finish
  };

  const reserved = await app.inject({
    method: "POST",
    url: "/api/orders/order-demo/material-reservation",
    payload: { warehouseId: "warehouse-main", requirements: [{ ...requirement, qty: 5 }] }
  });
  assert.equal(reserved.statusCode, 201);

  const issued = await app.inject({
    method: "POST",
    url: "/api/orders/order-demo/material-issue",
    payload: { warehouseId: "warehouse-main", requirements: [{ ...requirement, qty: 2 }] }
  });
  assert.equal(issued.statusCode, 201);
  assert.deepEqual(
    (({ onHandQty, reservedQty, availableQty }) => ({ onHandQty, reservedQty, availableQty }))(variant(await balances(app), "black", "matte")),
    { onHandQty: 8, reservedQty: 3, availableQty: 5 }
  );

  const cancelled = await app.inject({
    method: "POST",
    url: "/api/orders/order-demo/transitions",
    headers: { "if-match": "1", "idempotency-key": "cancel-partially-issued-order" },
    payload: { to: "cancelled" }
  });
  assert.equal(cancelled.statusCode, 200);
  assert.deepEqual(
    (({ onHandQty, reservedQty, availableQty }) => ({ onHandQty, reservedQty, availableQty }))(variant(await balances(app), "black", "matte")),
    { onHandQty: 8, reservedQty: 0, availableQty: 8 }
  );

  const reservations = await repository.listInventoryReservations("tenant-demo", "order-demo");
  assert.equal(reservations.length, 1);
  assert.deepEqual(
    (({ qty, issuedQty, releasedQty, status }) => ({ qty, issuedQty, releasedQty, status }))(reservations[0]!),
    { qty: 5, issuedQty: 2, releasedQty: 3, status: "released" }
  );
});

test("order material issue is atomic and never consumes another order's reservation", async (context) => {
  const repository = new MemoryRepository();
  const app = await buildApp(
    { ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" },
    { repository }
  );
  context.after(() => app.close());

  const imported = await app.inject({
    method: "POST",
    url: "/api/materials/import/commit",
    payload: {
      warehouseId: "warehouse-main",
      source: "atomic-order-issue-test",
      rows: [{ materialKey: "TUBE", specKey: "750", color: "black", finish: "matte", name: "Tube black matte", openingQty: 10 }]
    }
  });
  assert.equal(imported.statusCode, 201);
  const material = variant(await balances(app), "black", "matte");
  const requirement = {
    materialId: material.materialId,
    materialKey: material.materialKey,
    specKey: material.specKey,
    color: material.color,
    finish: material.finish
  };
  await repository.createInventoryReservation("tenant-demo", {
    orderId: "order-demo", warehouseId: "warehouse-main", requirements: [{ ...requirement, qty: 5 }]
  }, "user-demo");
  await repository.createInventoryReservation("tenant-demo", {
    orderId: "other-order", warehouseId: "warehouse-main", requirements: [{ ...requirement, qty: 4 }]
  }, "user-demo");

  const blocked = await app.inject({
    method: "POST",
    url: "/api/orders/order-demo/material-issue",
    payload: { warehouseId: "warehouse-main", requirements: [{ ...requirement, qty: 7 }] }
  });
  assert.equal(blocked.statusCode, 409);
  assert.deepEqual(
    (({ onHandQty, reservedQty, availableQty }) => ({ onHandQty, reservedQty, availableQty }))(variant(await balances(app), "black", "matte")),
    { onHandQty: 10, reservedQty: 9, availableQty: 1 }
  );
  assert.equal((await repository.listStockDocuments("tenant-demo", "issue")).length, 0);
  assert.deepEqual(
    (await repository.listInventoryReservations("tenant-demo")).map(({ orderId, issuedQty, status }) => ({ orderId, issuedQty, status })).sort((a, b) => a.orderId.localeCompare(b.orderId)),
    [
      { orderId: "order-demo", issuedQty: 0, status: "active" },
      { orderId: "other-order", issuedQty: 0, status: "active" }
    ]
  );

  const issued = await app.inject({
    method: "POST",
    url: "/api/orders/order-demo/material-issue",
    payload: { warehouseId: "warehouse-main", requirements: [{ ...requirement, qty: 2 }] }
  });
  assert.equal(issued.statusCode, 201);
  assert.deepEqual(
    (await repository.listInventoryReservations("tenant-demo")).map(({ orderId, issuedQty, status }) => ({ orderId, issuedQty, status })).sort((a, b) => a.orderId.localeCompare(b.orderId)),
    [
      { orderId: "order-demo", issuedQty: 2, status: "active" },
      { orderId: "other-order", issuedQty: 0, status: "active" }
    ]
  );
});

test("inventory records and stock documents cannot cross tenant boundaries", async () => {
  const repository = new MemoryRepository();
  const warehouseA = await repository.createWarehouse("tenant-a", { code: "MAIN-A", name: "Tenant A warehouse", isDefault: true });
  const warehouseB = await repository.createWarehouse("tenant-b", { code: "MAIN-B", name: "Tenant B warehouse", isDefault: true });
  const materialA = await repository.createMaterial("tenant-a", {
    materialKey: "PANEL",
    specKey: "350x350",
    color: "white",
    finish: "matte",
    name: "Tenant A panel"
  });
  const materialB = await repository.createMaterial("tenant-b", {
    materialKey: "PANEL",
    specKey: "350x350",
    color: "white",
    finish: "matte",
    name: "Tenant B panel"
  });

  const documentA = await repository.createStockDocument("tenant-a", {
    type: "receive",
    warehouseId: warehouseA.id,
    lines: [{ materialId: materialA.id, materialKey: "PANEL", specKey: "350x350", color: "white", finish: "matte", qty: 12 }]
  }, "actor-a");
  await repository.postStockDocument("tenant-a", documentA.id, "actor-a");

  const documentB = await repository.createStockDocument("tenant-b", {
    type: "receive",
    warehouseId: warehouseB.id,
    lines: [{ materialId: materialB.id, materialKey: "PANEL", specKey: "350x350", color: "white", finish: "matte", qty: 5 }]
  }, "actor-b");
  await repository.postStockDocument("tenant-b", documentB.id, "actor-b");

  const [tenantA, tenantB] = await Promise.all([
    repository.listInventoryBalances("tenant-a"),
    repository.listInventoryBalances("tenant-b")
  ]);
  assert.deepEqual(tenantA.map((item) => [item.tenantId, item.materialId, item.onHandQty]), [["tenant-a", materialA.id, 12]]);
  assert.deepEqual(tenantB.map((item) => [item.tenantId, item.materialId, item.onHandQty]), [["tenant-b", materialB.id, 5]]);
  assert.equal((await repository.listInventoryLedger("tenant-a")).every((item) => item.tenantId === "tenant-a"), true);
  assert.equal((await repository.listInventoryLedger("tenant-b")).every((item) => item.tenantId === "tenant-b"), true);

  await assert.rejects(
    repository.reverseStockDocument("tenant-b", documentA.id, "actor-b"),
    (error: unknown) => {
      assert.equal((error as { statusCode?: number }).statusCode, 404);
      return true;
    }
  );
  assert.equal((await repository.listInventoryBalances("tenant-a"))[0]?.onHandQty, 12);
  assert.equal((await repository.listInventoryBalances("tenant-b"))[0]?.onHandQty, 5);
});

test("material import preserves blank optional fields and parses string false as disabled", async () => {
  const repository = new MemoryRepository();
  const existing = await repository.createMaterial("tenant-demo", {
    materialCode: "IMPORT-PRESERVE-001",
    materialKey: "IMPORT-PRESERVE",
    specKey: "standard",
    category: "hardware",
    color: "black",
    finish: "matte",
    name: "Original material",
    specification: "Original specification",
    unit: "pcs",
    weightKg: 1.25,
    referenceCostMinor: 12_345,
    note: "Original note",
    source: "Original source",
    active: true
  });

  const row = {
    materialCode: existing.materialCode,
    materialKey: existing.materialKey,
    specKey: existing.specKey,
    category: "",
    color: "",
    finish: "",
    name: "Updated material name",
    specification: "",
    unit: "",
    weightKg: "",
    referenceCost: "",
    note: "",
    source: "",
    active: "false",
    openingQty: 0
  };
  const preview = await repository.previewMaterialImport("tenant-demo", { materialRows: [row] });
  assert.deepEqual(preview.errors, []);
  assert.equal(preview.materialRows[0]?.active, false);
  const decimalPreview = await repository.previewMaterialImport("tenant-demo", {
    materialRows: [{ ...row, openingQty: 1.5 }]
  });
  assert.equal(decimalPreview.errors.length, 1);

  await repository.commitMaterialImport("tenant-demo", {
    batchId: "preserve-blank-optional-fields",
    materialRows: [row],
    openingRows: []
  }, "user-demo");
  const saved = (await repository.listMaterials("tenant-demo")).find((material) => material.id === existing.id);
  assert.ok(saved);
  assert.deepEqual(
    {
      category: saved.category,
      color: saved.color,
      finish: saved.finish,
      specification: saved.specification,
      unit: saved.unit,
      weightKg: saved.weightKg,
      referenceCostMinor: saved.referenceCostMinor,
      note: saved.note,
      source: saved.source,
      active: saved.active
    },
    {
      category: "hardware",
      color: "black",
      finish: "matte",
      specification: "Original specification",
      unit: "pcs",
      weightKg: 1.25,
      referenceCostMinor: 12_345,
      note: "Original note",
      source: "Original source",
      active: false
    }
  );
});

test("memory material import rolls back the whole batch when a later warehouse fails", async () => {
  const repository = new MemoryRepository();
  const before = {
    warehouses: await repository.listWarehouses("tenant-demo"),
    materials: await repository.listMaterials("tenant-demo"),
    balances: await repository.listInventoryBalances("tenant-demo"),
    ledger: await repository.listInventoryLedger("tenant-demo"),
    documents: await repository.listStockDocuments("tenant-demo")
  };
  const originalPost = repository.postStockDocument.bind(repository);
  let postingCount = 0;
  repository.postStockDocument = async (...args) => {
    postingCount += 1;
    if (postingCount === 2) throw new Error("simulated second warehouse posting failure");
    return originalPost(...args);
  };

  await assert.rejects(
    repository.commitMaterialImport("tenant-demo", {
      batchId: "multi-warehouse-rollback",
      materialRows: [
        { materialCode: "ROLLBACK-MAT-A", materialKey: "ROLLBACK-A", specKey: "standard", name: "Rollback A" },
        { materialCode: "ROLLBACK-MAT-B", materialKey: "ROLLBACK-B", specKey: "standard", name: "Rollback B" }
      ],
      openingRows: [
        { warehouseCode: "ROLLBACK-WH-A", materialCode: "ROLLBACK-MAT-A", openingQty: 2 },
        { warehouseCode: "ROLLBACK-WH-B", materialCode: "ROLLBACK-MAT-B", openingQty: 3 }
      ]
    }, "user-demo"),
    /simulated second warehouse posting failure/
  );

  assert.deepEqual(await repository.listWarehouses("tenant-demo"), before.warehouses);
  assert.deepEqual(await repository.listMaterials("tenant-demo"), before.materials);
  assert.deepEqual(await repository.listInventoryBalances("tenant-demo"), before.balances);
  assert.deepEqual(await repository.listInventoryLedger("tenant-demo"), before.ledger);
  assert.deepEqual(await repository.listStockDocuments("tenant-demo"), before.documents);
});

test("availability-only accounts never receive inventory quantities or warehouse distribution", async (context) => {
  const repository = new MemoryRepository();
  const app = await buildApp(
    { ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" },
    { repository }
  );
  context.after(() => app.close());

  const employee = await app.inject({
    method: "POST",
    url: "/api/employees",
    headers: { "idempotency-key": "availability-only-employee" },
    payload: { name: "Availability Only", phone: "13800000991", password: "availability-password-123" }
  });
  assert.equal(employee.statusCode, 201);
  const accountId = body<{ item: { id: string } }>(employee).item.id;

  const authorization = await app.inject({
    method: "PUT",
    url: `/api/accounts/${accountId}/authorization`,
    payload: {
      grants: [
        { permission: "inventory.availability.view", scope: "organization", assignedUserIds: [] },
        { permission: "inventory.adjust", scope: "organization", assignedUserIds: [] },
        { permission: "reports.personal.view", scope: "own", assignedUserIds: [] }
      ],
      dataScopes: []
    }
  });
  assert.equal(authorization.statusCode, 200);

  const signIn = await app.inject({
    method: "POST",
    url: "/api/auth/sign-in/phone-number",
    payload: { phoneNumber: "+8613800000991", password: "availability-password-123" }
  });
  assert.equal(signIn.statusCode, 200);
  const cookieHeader = signIn.headers["set-cookie"];
  assert.ok(cookieHeader);
  const headers = { cookie: Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader };
  await repository.createMaterial("tenant-demo", {
    materialKey: "COST-TEST", specKey: "standard", name: "Cost protected material", referenceCostMinor: 987_654
  });
  const materials = await app.inject({ method: "GET", url: "/api/materials", headers });
  assert.equal(materials.statusCode, 200);
  const protectedMaterial = body<{ items: Array<Record<string, unknown>> }>(materials).items.find((item) => item.materialKey === "COST-TEST");
  assert.ok(protectedMaterial);
  assert.equal(Object.hasOwn(protectedMaterial, "referenceCostMinor"), false);

  const costImport = await app.inject({
    method: "POST", url: "/api/materials/import/preview", headers,
    payload: { rows: [{ materialKey: "COST-IMPORT", specKey: "standard", name: "Protected import", referenceCost: 123.45 }] }
  });
  assert.equal(costImport.statusCode, 403);

  const report = await app.inject({ method: "GET", url: "/api/employees/order-summary", headers });
  assert.equal(report.statusCode, 200);
  const reportItem = body<{ items: Array<Record<string, unknown>> }>(report).items[0];
  assert.ok(reportItem);
  assert.equal(reportItem.totalAmountMinor, null);

  assert.equal((await app.inject({ method: "GET", url: "/api/warehouses", headers })).statusCode, 403);

  assert.equal((await app.inject({ method: "POST", url: "/api/pricing/calculate", headers, payload: {} })).statusCode, 403);
  const payload = {
    requirements: [{ materialKey: "TUBE", specKey: "750", color: "black", finish: "matte", qty: 9 }],
    context: { warehouseId: "warehouse-main" }
  };

  for (const url of ["/api/inventory/check", "/api/inventory/check-legacy"]) {
    const response = await app.inject({ method: "POST", url, headers, payload });
    assert.equal(response.statusCode, 200);
    const item = body<{ data: Array<Record<string, unknown>> }>(response).data[0];
    assert.ok(item);
    assert.equal(typeof item.status, "string");
    for (const field of ["warehouseId", "requestedQty", "availableQty", "reservedQty", "shortageQty"]) {
      assert.equal(Object.hasOwn(item, field), false, `${url} exposed ${field}`);
    }
  }
});
