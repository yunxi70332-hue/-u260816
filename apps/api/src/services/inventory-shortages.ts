import { createHash } from "node:crypto";
import type {
  InventoryBalance,
  InventoryReservation,
  MaterialVariant,
  Order,
  OrderStatus
} from "@usm/contracts";
import { matchOfficialBulkSku } from "../../../../src/official-bulk-sku-catalog.js";
import type { Repository } from "../repository.js";

const ACTIVE_ORDER_STATUSES = new Set<OrderStatus>([
  "confirmed",
  "technical_review",
  "ready_for_production",
  "in_production",
  "on_hold"
]);

type InventoryShortageKind = "custom_made" | "stock_shortage" | "depleted_stock";
type InventoryShortageFollowUp = "production" | "replenishment";

export interface InventoryShortage {
  id: string;
  kind: InventoryShortageKind;
  reason: "not_in_official_bulk_catalog" | "insufficient_available_stock" | "no_available_stock";
  followUp: InventoryShortageFollowUp;
  orderId: string | null;
  orderCode: string | null;
  orderStatus: OrderStatus | null;
  materialId: string | null;
  materialKey: string;
  specKey: string;
  materialCode: string;
  name: string;
  specification: string;
  color: string | null;
  finish: string | null;
  unit: string;
  officialSkuCode: string | null;
  requiredQty: number | null;
  reservedQty: number | null;
  issuedQty: number | null;
  availableQty: number | null;
  shortageQty: number | null;
  createdAt: string;
  updatedAt: string;
}

interface Requirement {
  order: Order;
  material: MaterialVariant | null;
  materialKey: string;
  specKey: string;
  materialCode: string;
  name: string;
  specification: string;
  color: string;
  finish: string;
  unit: string;
  officialSkuCode: string | null;
  requiredQty: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function materialIdentity(value: Pick<Requirement, "materialKey" | "specKey" | "color" | "finish">): string {
  return [value.materialKey, value.specKey, value.color, value.finish].join("\u0000");
}

function materialIdentityFromVariant(value: MaterialVariant): string {
  return [value.materialKey, value.specKey, value.color, value.finish].join("\u0000");
}

function frozenBom(order: Order): Record<string, unknown>[] {
  const snapshot = isRecord(order.snapshot) ? order.snapshot : {};
  const quote = isRecord(snapshot.quote) ? snapshot.quote : {};
  const quoteSnapshot = isRecord(quote.snapshot) ? quote.snapshot : {};
  const designVersion = isRecord(quoteSnapshot.designVersion) ? quoteSnapshot.designVersion : {};
  const source = Array.isArray(designVersion.bomSnapshot)
    ? designVersion.bomSnapshot
    : isRecord(quoteSnapshot.calculation) && Array.isArray(quoteSnapshot.calculation.lines)
      ? quoteSnapshot.calculation.lines
      : [];
  return source.filter(isRecord);
}

function stableAlertId(kind: InventoryShortageKind, ...parts: Array<string | null>): string {
  const digest = createHash("sha256").update([kind, ...parts].join("\u0000")).digest("hex").slice(0, 20);
  return `inventory-shortage-${digest}`;
}

function visibleQuantity(value: number, quantityVisible: boolean): number | null {
  return quantityVisible ? value : null;
}

function latestTimestamp(...timestamps: Array<string | undefined>): string {
  return timestamps.filter((value): value is string => Boolean(value)).sort().at(-1) ?? new Date(0).toISOString();
}

function reservationsFor(
  reservations: InventoryReservation[],
  orderId: string,
  materialId: string | null
): { reservedQty: number; issuedQty: number; updatedAt?: string } {
  if (!materialId) return { reservedQty: 0, issuedQty: 0 };
  const related = reservations.filter((item) => item.orderId === orderId && item.materialId === materialId);
  return {
    reservedQty: related.reduce(
      (sum, item) => sum + (item.status === "active" ? Math.max(0, item.qty - item.issuedQty - item.releasedQty) : 0),
      0
    ),
    issuedQty: related.reduce((sum, item) => sum + item.issuedQty, 0),
    updatedAt: latestTimestamp(...related.map((item) => item.updatedAt))
  };
}

function groupOrderRequirements(order: Order, materialsByIdentity: Map<string, MaterialVariant>): Requirement[] {
  const grouped = new Map<string, Requirement>();
  for (const raw of frozenBom(order)) {
    const materialKey = text(raw.materialKey ?? raw.materialCode ?? raw.sourceRef ?? raw.name);
    const specKey = text(raw.specKey ?? raw.baseSpec ?? raw.spec ?? raw.specification, "standard");
    const color = text(raw.color);
    const finish = text(raw.finish);
    const requiredQty = Math.max(0, Math.round(Number(raw.qty ?? raw.quantity ?? 0)));
    if (!materialKey || requiredQty <= 0) continue;

    const identity = [materialKey, specKey, color, finish].join("\u0000");
    const material = materialsByIdentity.get(identity) ?? null;
    const official = matchOfficialBulkSku(raw as Parameters<typeof matchOfficialBulkSku>[0]);
    const officialSkuCode = official?.skuCode ?? null;
    const groupKey = [identity, officialSkuCode ?? "custom"].join("\u0000");
    const current = grouped.get(groupKey) ?? {
      order,
      material,
      materialKey,
      specKey,
      materialCode: material?.materialCode ?? text(raw.materialCode, materialKey),
      name: material?.name ?? text(raw.name, official?.name ?? materialKey),
      specification: material?.specification || text(raw.baseSpec ?? raw.specification ?? raw.spec, official?.specification ?? specKey),
      color,
      finish,
      unit: text(raw.unit, material?.unit ?? official?.unit ?? "pcs"),
      officialSkuCode,
      requiredQty: 0
    };
    current.requiredQty += requiredQty;
    grouped.set(groupKey, current);
  }
  return [...grouped.values()];
}

function orderAlert(
  requirement: Requirement,
  quantityVisible: boolean,
  quantities: { reservedQty: number; issuedQty: number; availableQty: number; shortageQty: number },
  updatedAt: string
): InventoryShortage {
  const customMade = requirement.officialSkuCode === null;
  return {
    id: stableAlertId(customMade ? "custom_made" : "stock_shortage", requirement.order.id, requirement.material?.id ?? materialIdentity(requirement)),
    kind: customMade ? "custom_made" : "stock_shortage",
    reason: customMade ? "not_in_official_bulk_catalog" : "insufficient_available_stock",
    followUp: customMade ? "production" : "replenishment",
    orderId: requirement.order.id,
    orderCode: requirement.order.code,
    orderStatus: requirement.order.status,
    materialId: requirement.material?.id ?? null,
    materialKey: requirement.materialKey,
    specKey: requirement.specKey,
    materialCode: requirement.materialCode,
    name: requirement.name,
    specification: requirement.specification,
    color: requirement.color || null,
    finish: requirement.finish || null,
    unit: requirement.unit,
    officialSkuCode: requirement.officialSkuCode,
    requiredQty: visibleQuantity(requirement.requiredQty, quantityVisible),
    reservedQty: visibleQuantity(quantities.reservedQty, quantityVisible),
    issuedQty: visibleQuantity(quantities.issuedQty, quantityVisible),
    availableQty: visibleQuantity(quantities.availableQty, quantityVisible),
    shortageQty: visibleQuantity(quantities.shortageQty, quantityVisible),
    createdAt: requirement.order.createdAt,
    updatedAt
  };
}

function depletedAlert(
  material: MaterialVariant,
  balances: InventoryBalance[],
  quantityVisible: boolean
): InventoryShortage {
  const availableQty = balances.reduce((sum, item) => sum + item.availableQty, 0);
  return {
    id: stableAlertId("depleted_stock", null, material.id),
    kind: "depleted_stock",
    reason: "no_available_stock",
    followUp: "replenishment",
    orderId: null,
    orderCode: null,
    orderStatus: null,
    materialId: material.id,
    materialKey: material.materialKey,
    specKey: material.specKey,
    materialCode: material.materialCode,
    name: material.name,
    specification: material.specification || material.specKey,
    color: material.color || null,
    finish: material.finish || null,
    unit: material.unit,
    officialSkuCode: null,
    requiredQty: null,
    reservedQty: visibleQuantity(balances.reduce((sum, item) => sum + item.reservedQty, 0), quantityVisible),
    issuedQty: null,
    availableQty: visibleQuantity(availableQty, quantityVisible),
    shortageQty: null,
    createdAt: balances.map((item) => item.createdAt).sort()[0] ?? material.createdAt,
    updatedAt: latestTimestamp(material.updatedAt, ...balances.map((item) => item.updatedAt))
  };
}

export async function listInventoryShortages(
  repository: Repository,
  tenantId: string,
  quantityVisible: boolean
): Promise<InventoryShortage[]> {
  const [orders, materials, balances, reservations] = await Promise.all([
    repository.listOrders(tenantId),
    repository.listMaterials(tenantId),
    repository.listInventoryBalances(tenantId),
    repository.listInventoryReservations(tenantId)
  ]);
  const activeOrders = orders
    .filter((order) => ACTIVE_ORDER_STATUSES.has(order.status))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.code.localeCompare(right.code) || left.id.localeCompare(right.id));
  const materialsByIdentity = new Map(materials.map((material) => [materialIdentityFromVariant(material), material]));
  const balancesByMaterial = new Map<string, InventoryBalance[]>();
  for (const balance of balances) {
    const current = balancesByMaterial.get(balance.materialId) ?? [];
    current.push(balance);
    balancesByMaterial.set(balance.materialId, current);
  }
  const remainingAvailable = new Map(
    [...balancesByMaterial].map(([materialId, items]) => [materialId, items.reduce((sum, item) => sum + item.availableQty, 0)])
  );
  const alerts: InventoryShortage[] = [];
  const orderAlertMaterialIds = new Set<string>();

  for (const order of activeOrders) {
    for (const requirement of groupOrderRequirements(order, materialsByIdentity)) {
      const reservation = reservationsFor(reservations, order.id, requirement.material?.id ?? null);
      const remainingDemand = Math.max(0, requirement.requiredQty - reservation.issuedQty - reservation.reservedQty);
      if (!requirement.officialSkuCode) {
        if (requirement.material) orderAlertMaterialIds.add(requirement.material.id);
        alerts.push(orderAlert(requirement, quantityVisible, {
          reservedQty: reservation.reservedQty,
          issuedQty: reservation.issuedQty,
          availableQty: 0,
          shortageQty: remainingDemand
        }, latestTimestamp(order.updatedAt, requirement.material?.updatedAt, reservation.updatedAt)));
        continue;
      }

      const materialId = requirement.material?.id ?? null;
      const availableBefore = materialId ? remainingAvailable.get(materialId) ?? 0 : 0;
      const allocatedAvailable = Math.min(remainingDemand, availableBefore);
      if (materialId) remainingAvailable.set(materialId, Math.max(0, availableBefore - allocatedAvailable));
      const shortageQty = Math.max(0, remainingDemand - allocatedAvailable);
      if (shortageQty <= 0) continue;
      if (materialId) orderAlertMaterialIds.add(materialId);
      const relatedBalances = materialId ? balancesByMaterial.get(materialId) ?? [] : [];
      alerts.push(orderAlert(requirement, quantityVisible, {
        reservedQty: reservation.reservedQty,
        issuedQty: reservation.issuedQty,
        availableQty: allocatedAvailable,
        shortageQty
      }, latestTimestamp(order.updatedAt, requirement.material?.updatedAt, reservation.updatedAt, ...relatedBalances.map((item) => item.updatedAt))));
    }
  }

  for (const material of materials) {
    const materialBalances = balancesByMaterial.get(material.id);
    if (!materialBalances?.length || orderAlertMaterialIds.has(material.id)) continue;
    if (materialBalances.reduce((sum, item) => sum + item.availableQty, 0) <= 0) {
      alerts.push(depletedAlert(material, materialBalances, quantityVisible));
    }
  }

  return alerts.sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt)
    || (left.orderCode ?? "").localeCompare(right.orderCode ?? "")
    || left.id.localeCompare(right.id)
  );
}
