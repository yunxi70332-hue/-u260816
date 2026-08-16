import assert from "node:assert/strict";
import test from "node:test";
import type {
  InventoryBalance,
  InventoryReservation,
  MaterialVariant,
  Order
} from "@usm/contracts";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { calculateAuthorization } from "../src/authorization.js";
import { loadConfig } from "../src/config.js";
import { MemoryRepository } from "../src/memory-repository.js";

const BASE_TIME = "2026-08-15T01:00:00.000Z";

interface ShortageItem {
  id: string;
  kind: "custom_made" | "stock_shortage" | "depleted_stock";
  reason: string;
  followUp: "production" | "replenishment";
  orderId: string | null;
  orderCode: string | null;
  materialId: string | null;
  materialKey: string;
  officialSkuCode: string | null;
  requiredQty: number | null;
  reservedQty: number | null;
  issuedQty: number | null;
  availableQty: number | null;
  shortageQty: number | null;
}

function responseBody<T>(response: { body: string }): T {
  return JSON.parse(response.body) as T;
}

function tenantMap<T>(): Map<string, T[]> {
  return new Map<string, T[]>();
}

class ShortageRepository extends MemoryRepository {
  private readonly fixtureOrders = tenantMap<Order>();
  private readonly fixtureMaterials = tenantMap<MaterialVariant>();
  private readonly fixtureBalances = tenantMap<InventoryBalance>();
  private readonly fixtureReservations = tenantMap<InventoryReservation>();
  private readonly extraTenants = new Set<string>();

  setFixtures(tenantId: string, input: {
    orders?: Order[];
    materials?: MaterialVariant[];
    balances?: InventoryBalance[];
    reservations?: InventoryReservation[];
  }): void {
    if (tenantId !== "tenant-demo") this.extraTenants.add(tenantId);
    this.fixtureOrders.set(tenantId, structuredClone(input.orders ?? []));
    this.fixtureMaterials.set(tenantId, structuredClone(input.materials ?? []));
    this.fixtureBalances.set(tenantId, structuredClone(input.balances ?? []));
    this.fixtureReservations.set(tenantId, structuredClone(input.reservations ?? []));
  }

  override async resolveMembership(userId: string, preferredTenantId?: string) {
    if (preferredTenantId && this.extraTenants.has(preferredTenantId)) {
      return {
        tenant: { id: preferredTenantId, name: preferredTenantId, slug: preferredTenantId },
        role: "owner" as const,
        organizationType: "hq" as const
      };
    }
    return super.resolveMembership(userId, preferredTenantId);
  }

  override async getAuthorization(userId: string, tenantId: string, role?: Parameters<MemoryRepository["getAuthorization"]>[2]) {
    if (this.extraTenants.has(tenantId)) {
      return calculateAuthorization({
        role: role ?? "owner",
        organizationType: "hq",
        grants: [
          { permission: "inventory.availability.view", scope: "organization", assignedUserIds: [] },
          { permission: "inventory.quantity.view", scope: "organization", assignedUserIds: [] }
        ],
        entitlements: [{ module: "warehouse", enabled: true, permissionAllowlist: null }]
      });
    }
    return super.getAuthorization(userId, tenantId, role);
  }

  override async listOrders(tenantId: string, projectId?: string, ownerUserId?: string): Promise<Order[]> {
    return structuredClone((this.fixtureOrders.get(tenantId) ?? []).filter((item) =>
      (!projectId || item.projectId === projectId) && (!ownerUserId || item.ownerUserId === ownerUserId)
    ));
  }

  override async listMaterials(tenantId: string, search?: string): Promise<MaterialVariant[]> {
    const needle = search?.trim().toLowerCase();
    return structuredClone((this.fixtureMaterials.get(tenantId) ?? []).filter((item) =>
      !needle || [item.materialCode, item.materialKey, item.name, item.specification].some((value) => value.toLowerCase().includes(needle))
    ));
  }

  override async listInventoryBalances(tenantId: string, warehouseId?: string, materialIds?: string[]): Promise<InventoryBalance[]> {
    return structuredClone((this.fixtureBalances.get(tenantId) ?? []).filter((item) =>
      (!warehouseId || item.warehouseId === warehouseId) && (!materialIds?.length || materialIds.includes(item.materialId))
    ));
  }

  override async listInventoryReservations(tenantId: string, orderId?: string): Promise<InventoryReservation[]> {
    return structuredClone((this.fixtureReservations.get(tenantId) ?? []).filter((item) => !orderId || item.orderId === orderId));
  }
}

function material(id: string, materialKey: string, specKey: string): MaterialVariant {
  return {
    id,
    tenantId: "tenant-demo",
    materialCode: `MAT-${id}`,
    materialKey,
    specKey,
    category: "panel",
    color: "#fffef0",
    finish: "",
    name: materialKey === "panel" ? "Metal panel" : "Tube",
    specification: specKey,
    unit: "pcs",
    weightKg: null,
    referenceCostMinor: null,
    note: "",
    source: "test",
    active: true,
    revision: 1,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME
  };
}

function balance(materialItem: MaterialVariant, availableQty: number, reservedQty = 0): InventoryBalance {
  return {
    id: `balance-${materialItem.id}`,
    tenantId: materialItem.tenantId,
    warehouseId: "warehouse-main",
    materialId: materialItem.id,
    materialKey: materialItem.materialKey,
    specKey: materialItem.specKey,
    color: materialItem.color,
    finish: materialItem.finish,
    onHandQty: availableQty + reservedQty,
    reservedQty,
    availableQty,
    revision: 1,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME
  };
}

function bomLine(spec: string, qty: number): Record<string, unknown> {
  return {
    materialKey: "panel",
    materialCode: "panel",
    specKey: spec,
    baseSpec: spec,
    spec,
    name: "Metal panel",
    color: "#fffef0",
    finish: "",
    qty,
    unit: "pcs"
  };
}

function order(id: string, code: string, createdAt: string, bom: Record<string, unknown>[], status: Order["status"] = "confirmed", tenantId = "tenant-demo"): Order {
  return {
    id,
    tenantId,
    code,
    createdByUserId: "user-demo",
    projectId: "project-demo",
    customerId: "customer-demo",
    acceptedQuoteId: `quote-${id}`,
    status,
    currency: "CNY",
    totalMinor: 0,
    snapshot: {
      schemaVersion: 1,
      acceptedAt: createdAt,
      quote: { snapshot: { designVersion: { bomSnapshot: bom } } }
    },
    customerConfirmedAt: createdAt,
    deliveryLeadTimeDays: 30,
    expectedDeliveryDate: null,
    productionNote: null,
    shippingNote: null,
    ownerUserId: null,
    assignedAt: null,
    assignedByUserId: null,
    revision: 1,
    createdAt,
    updatedAt: createdAt
  };
}

function reservation(orderId: string, materialId: string, qty: number): InventoryReservation {
  return {
    id: `reservation-${orderId}`,
    tenantId: "tenant-demo",
    orderId,
    warehouseId: "warehouse-main",
    materialId,
    qty,
    issuedQty: 0,
    releasedQty: 0,
    status: "active",
    revision: 1,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME
  };
}

async function appFor(repository: ShortageRepository): Promise<FastifyInstance> {
  return buildApp(
    { ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" },
    { repository }
  );
}

async function createRestrictedUser(
  app: FastifyInstance,
  phone: string,
  grants: Array<{ permission: "inventory.availability.view"; scope: "organization"; assignedUserIds: string[] }>
): Promise<Record<string, string>> {
  const password = "shortage-viewer-password-123";
  const employee = await app.inject({
    method: "POST",
    url: "/api/employees",
    headers: { "idempotency-key": `employee-${phone}` },
    payload: { name: `Viewer ${phone}`, phone, password }
  });
  assert.equal(employee.statusCode, 201);
  const accountId = responseBody<{ item: { id: string } }>(employee).item.id;
  const authorization = await app.inject({
    method: "PUT",
    url: `/api/accounts/${accountId}/authorization`,
    payload: { grants, dataScopes: [] }
  });
  assert.equal(authorization.statusCode, 200);
  const signIn = await app.inject({
    method: "POST",
    url: "/api/auth/sign-in/phone-number",
    payload: { phoneNumber: `+86${phone}`, password }
  });
  assert.equal(signIn.statusCode, 200);
  const cookie = signIn.headers["set-cookie"];
  assert.ok(cookie);
  return { cookie: Array.isArray(cookie) ? cookie[0]! : cookie };
}

function sharedStockFixtures(repository: ShortageRepository): void {
  const panel = material("panel-standard", "panel", "750x350");
  const depleted = material("tube-depleted", "tube304", "750");
  repository.setFixtures("tenant-demo", {
    materials: [panel, depleted],
    balances: [balance(panel, 5, 4), balance(depleted, 0)],
    reservations: [reservation("order-reserved", panel.id, 4)],
    orders: [
      order("order-reserved", "ORD-001", "2026-08-15T01:01:00.000Z", [bomLine("750x350", 4)]),
      order("order-funded", "ORD-002", "2026-08-15T01:02:00.000Z", [bomLine("750x350", 4)]),
      order("order-short", "ORD-003", "2026-08-15T01:03:00.000Z", [bomLine("750x350", 4)]),
      order("order-custom", "ORD-004", "2026-08-15T01:04:00.000Z", [bomLine("420x310", 2)]),
      order("order-complete", "ORD-005", "2026-08-15T01:05:00.000Z", [bomLine("420x310", 9)], "completed")
    ]
  });
}

test("shortage API finds custom work, allocates shared stock stably, and avoids duplicate depleted alerts", async (context) => {
  const repository = new ShortageRepository();
  sharedStockFixtures(repository);
  const app = await appFor(repository);
  context.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/api/inventory/shortages" });
  assert.equal(response.statusCode, 200);
  const items = responseBody<{ items: ShortageItem[] }>(response).items;

  assert.equal(items.some((item) => item.orderId === "order-reserved"), false);
  assert.equal(items.some((item) => item.orderId === "order-funded"), false);
  assert.equal(items.some((item) => item.orderId === "order-complete"), false);

  const stock = items.find((item) => item.kind === "stock_shortage");
  assert.ok(stock);
  assert.equal(stock.orderId, "order-short");
  assert.equal(stock.officialSkuCode === null, false);
  assert.deepEqual(
    (({ requiredQty, reservedQty, issuedQty, availableQty, shortageQty }) => ({ requiredQty, reservedQty, issuedQty, availableQty, shortageQty }))(stock),
    { requiredQty: 4, reservedQty: 0, issuedQty: 0, availableQty: 1, shortageQty: 3 }
  );

  const custom = items.find((item) => item.kind === "custom_made");
  assert.ok(custom);
  assert.equal(custom.orderId, "order-custom");
  assert.equal(custom.reason, "not_in_official_bulk_catalog");
  assert.equal(custom.followUp, "production");
  assert.equal(custom.officialSkuCode, null);

  const depleted = items.find((item) => item.kind === "depleted_stock");
  assert.ok(depleted);
  assert.equal(depleted.materialId, "tube-depleted");
  assert.equal(depleted.orderId, null);
  assert.equal(items.filter((item) => item.materialId === "panel-standard" && item.kind === "depleted_stock").length, 0);
});

test("shortage API requires availability permission and the warehouse module", async (context) => {
  const noPermissionRepository = new ShortageRepository();
  const noPermissionApp = await appFor(noPermissionRepository);
  context.after(() => noPermissionApp.close());
  const headers = await createRestrictedUser(noPermissionApp, "13800000981", []);
  const forbidden = await noPermissionApp.inject({ method: "GET", url: "/api/inventory/shortages", headers });
  assert.equal(forbidden.statusCode, 403);

  const disabledRepository = new ShortageRepository();
  const entitlements = await disabledRepository.listOrganizationEntitlements("tenant-demo");
  await disabledRepository.updateOrganizationEntitlements(
    "tenant-demo",
    { entitlements: entitlements.map((item) => item.module === "warehouse" ? { ...item, enabled: false } : item) },
    "user-demo"
  );
  const disabledApp = await appFor(disabledRepository);
  context.after(() => disabledApp.close());
  const disabled = await disabledApp.inject({ method: "GET", url: "/api/inventory/shortages" });
  assert.equal(disabled.statusCode, 403);
});

test("availability-only shortage responses never leak quantities", async (context) => {
  const repository = new ShortageRepository();
  sharedStockFixtures(repository);
  const app = await appFor(repository);
  context.after(() => app.close());
  const headers = await createRestrictedUser(app, "13800000982", [
    { permission: "inventory.availability.view", scope: "organization", assignedUserIds: [] }
  ]);

  const response = await app.inject({ method: "GET", url: "/api/inventory/shortages", headers });
  assert.equal(response.statusCode, 200);
  const items = responseBody<{ items: ShortageItem[] }>(response).items;
  assert.ok(items.length > 0);
  for (const item of items) {
    assert.equal(item.requiredQty, null);
    assert.equal(item.reservedQty, null);
    assert.equal(item.issuedQty, null);
    assert.equal(item.availableQty, null);
    assert.equal(item.shortageQty, null);
  }
});

test("shortage API isolates alerts by the active tenant", async (context) => {
  const repository = new ShortageRepository();
  repository.setFixtures("tenant-a", {
    orders: [order("order-tenant-a", "ORD-A", BASE_TIME, [bomLine("420x310", 1)], "confirmed", "tenant-a")]
  });
  repository.setFixtures("tenant-b", {
    orders: [order("order-tenant-b", "ORD-B", BASE_TIME, [bomLine("410x305", 1)], "confirmed", "tenant-b")]
  });
  const app = await appFor(repository);
  context.after(() => app.close());

  const tenantA = await app.inject({ method: "GET", url: "/api/inventory/shortages", headers: { "x-tenant-id": "tenant-a" } });
  const tenantB = await app.inject({ method: "GET", url: "/api/inventory/shortages", headers: { "x-tenant-id": "tenant-b" } });
  assert.equal(tenantA.statusCode, 200);
  assert.equal(tenantB.statusCode, 200);
  assert.deepEqual(responseBody<{ items: ShortageItem[] }>(tenantA).items.map((item) => item.orderId), ["order-tenant-a"]);
  assert.deepEqual(responseBody<{ items: ShortageItem[] }>(tenantB).items.map((item) => item.orderId), ["order-tenant-b"]);
});
