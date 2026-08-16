import type { BomItem } from "../model";
import { readPendingOperations, writePendingOperations, type BusinessStorage } from "./storage";
import type {
  BusinessAdapter,
  BusinessContext,
  BusinessResult,
  InventoryAvailability,
  MaterialRequirement,
  PendingProductionOrderOperation,
  ProductionOrderDraft,
  ProductionOrderResult,
  RetryPendingOperationsResult
} from "./types";

const LOCAL_UNAVAILABLE_MESSAGE = "ERP is not connected; the operation was saved to the local retry queue.";

export class LocalBusinessAdapter implements BusinessAdapter {
  readonly source = "local" as const;

  constructor(private readonly storage: BusinessStorage) {}

  async resolveMaterials(bom: BomItem[]): Promise<BusinessResult<MaterialRequirement[]>> {
    return success(this.source, resolveBomRequirements(bom));
  }

  async checkInventory(
    requirements: MaterialRequirement[],
    context: BusinessContext
  ): Promise<BusinessResult<InventoryAvailability[]>> {
    const availability = requirements.map((requirement) => ({
      lineId: requirement.lineId,
      materialKey: requirement.materialKey,
      specKey: requirement.specKey,
      color: requirement.color,
      finish: requirement.finish,
      materialCode: requirement.materialCode ?? "",
      warehouseId: context.warehouseId,
      requestedQty: requirement.qty,
      availableQty: 0,
      reservedQty: 0,
      shortageQty: 0,
      status: "unknown" as const
    }));
    return unavailable(this.source, availability, "Inventory is unavailable while using the local adapter.");
  }

  async createProductionOrder(
    draft: ProductionOrderDraft,
    context: BusinessContext
  ): Promise<BusinessResult<ProductionOrderResult>> {
    const operations = readPendingOperations(this.storage);
    const existing = operations.find((operation) => operation.idempotencyKey === draft.clientRequestId);
    if (existing) {
      return unavailable(this.source, existing.result ?? queuedResult(existing.operationId), LOCAL_UNAVAILABLE_MESSAGE);
    }

    const now = new Date().toISOString();
    const operationId = createStableOperationId(draft.clientRequestId);
    const result = queuedResult(operationId);
    const operation: PendingProductionOrderOperation = {
      operationId,
      type: "createProductionOrder",
      idempotencyKey: draft.clientRequestId,
      payload: cloneValue({ ...draft, warehouseId: context.warehouseId }),
      createdAt: now,
      updatedAt: now,
      retryCount: 0,
      status: "pending",
      result
    };
    writePendingOperations(this.storage, [...operations, operation]);
    return unavailable(this.source, result, LOCAL_UNAVAILABLE_MESSAGE);
  }

  async getProductionOrder(id: string, context: BusinessContext): Promise<BusinessResult<ProductionOrderResult>> {
    const operation = readPendingOperations(this.storage).find((item) => (
      (item.operationId === id || item.idempotencyKey === id) && item.payload.warehouseId === context.warehouseId
    ));
    if (!operation) return failure(this.source, "Local production order was not found.");
    return unavailable(this.source, operation.result ?? queuedResult(operation.operationId), LOCAL_UNAVAILABLE_MESSAGE);
  }

  async retryPendingOperations(): Promise<BusinessResult<RetryPendingOperationsResult>> {
    const operations = readPendingOperations(this.storage);
    const retryable = operations.filter((operation) => operation.status === "pending" || operation.status === "failed");
    if (!retryable.length) return success(this.source, { attempted: 0, completed: 0, remaining: 0 });

    const now = new Date().toISOString();
    const updated = operations.map((operation) => (
      operation.status === "pending" || operation.status === "failed"
        ? { ...operation, updatedAt: now, retryCount: operation.retryCount + 1, status: "pending" as const, lastError: "ERP adapter is not configured." }
        : operation
    ));
    writePendingOperations(this.storage, updated);
    return unavailable(this.source, {
      attempted: retryable.length,
      completed: 0,
      remaining: retryable.length
    }, LOCAL_UNAVAILABLE_MESSAGE);
  }

  getPendingOperations() {
    return readPendingOperations(this.storage);
  }
}

export class HttpErpAdapter implements BusinessAdapter {
  readonly source = "erp" as const;
  private readonly localAdapter: LocalBusinessAdapter;

  constructor(storage?: BusinessStorage) {
    this.localAdapter = new LocalBusinessAdapter(storage ?? browserStorageFallback());
  }

  async resolveMaterials(bom: BomItem[]): Promise<BusinessResult<MaterialRequirement[]>> {
    const requirements = resolveBomRequirements(bom);
    try {
      const response = await requestErp<BusinessResult<MaterialRequirement[]>>("/api/materials/resolve", { bom });
      const enrichedByLine = new Map((response.data ?? []).map((item) => [item.lineId, item]));
      return {
        ...response,
        source: this.source,
        data: requirements.map((requirement, index) => {
          const enriched = enrichedByLine.get(requirement.lineId) ?? response.data?.[index];
          return {
            ...requirement,
            materialCode: enriched?.materialCode ?? requirement.materialCode,
            mappingStatus: enriched?.mappingStatus ?? requirement.mappingStatus
          };
        })
      };
    } catch (error) {
      return unavailable(this.source, requirements, errorMessage(error, "Material resolution failed."));
    }
  }

  async checkInventory(
    requirements: MaterialRequirement[],
    context: BusinessContext
  ): Promise<BusinessResult<InventoryAvailability[]>> {
    try {
      const response = await requestErp<BusinessResult<Partial<InventoryAvailability>[]>>("/api/inventory/check", { requirements, context });
      const data = (response.data ?? []).map((item, index) => {
        const requirement = requirements[index];
        return {
          lineId: item.lineId ?? requirement?.lineId,
          materialKey: item.materialKey ?? requirement?.materialKey ?? "",
          specKey: item.specKey ?? requirement?.specKey ?? "standard",
          color: item.color ?? requirement?.color,
          finish: item.finish ?? requirement?.finish,
          materialCode: item.materialCode ?? requirement?.materialCode ?? "",
          warehouseId: item.warehouseId ?? context.warehouseId,
          requestedQty: Number(item.requestedQty ?? requirement?.qty ?? 0),
          availableQty: Number(item.availableQty ?? 0),
          reservedQty: Number(item.reservedQty ?? 0),
          shortageQty: Number(item.shortageQty ?? 0),
          status: item.status ?? "unknown",
          updatedAt: item.updatedAt
        } satisfies InventoryAvailability;
      });
      return { ...response, source: this.source, data };
    } catch (error) {
      return unavailable(this.source, [], errorMessage(error, "Inventory query failed."));
    }
  }

  // Production order remains offline-safe until the ERP endpoint is enabled.
  createProductionOrder(draft: ProductionOrderDraft, context: BusinessContext) {
    return this.localAdapter.createProductionOrder(draft, context);
  }

  getProductionOrder(id: string, context: BusinessContext) {
    return this.localAdapter.getProductionOrder(id, context);
  }

  retryPendingOperations() {
    return this.localAdapter.retryPendingOperations();
  }
}

export function resolveBomRequirements(bom: BomItem[]): MaterialRequirement[] {
  return bom.map((item, index) => ({
    lineId: createRequirementLineId(item, index),
    materialKey: item.materialKey,
    specKey: item.specKey,
    name: item.name,
    spec: item.baseSpec ?? item.spec,
    color: item.color,
    finish: item.finish,
    qty: item.qty,
    unit: item.unit,
    mappingStatus: "unmatched"
  }));
}

function createRequirementLineId(item: BomItem, index: number) {
  return "bom-" + stableHash([item.materialKey, item.specKey, item.color ?? "", item.finish ?? "", item.unit, index].join("|"));
}

function createStableOperationId(clientRequestId: string) {
  return "production-" + stableHash(clientRequestId);
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function queuedResult(operationId: string): ProductionOrderResult {
  return { status: "queued", localOperationId: operationId, message: LOCAL_UNAVAILABLE_MESSAGE };
}

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function success<T>(source: "local" | "erp", data: T): BusinessResult<T> {
  return { status: "success", source, data, updatedAt: new Date().toISOString() };
}

function unavailable<T>(source: "local" | "erp", data: T | undefined, message: string): BusinessResult<T> {
  return { status: "unavailable", source, data, message, updatedAt: new Date().toISOString() };
}

function failure<T>(source: "local" | "erp", message: string): BusinessResult<T> {
  return { status: "error", source, message, updatedAt: new Date().toISOString() };
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function requestErp<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(resolveErpBaseUrl() + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "include",
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => undefined);
  if (!response.ok) throw new Error(`ERP request failed (${response.status})`);
  return payload as T;
}

function resolveErpBaseUrl() {
  if (typeof window === "undefined") return "http://127.0.0.1:9014";
  const { protocol, hostname, port } = window.location;
  if (port === "9011" || port === "9013" || port === "9014") return `${protocol}//${hostname}:9014`;
  return `${protocol}//${hostname}`;
}

function browserStorageFallback(): BusinessStorage {
  return {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined
  };
}
