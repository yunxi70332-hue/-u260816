import type { BomItem, CabinetConfig } from "../model";

export type AsyncStatus = "idle" | "loading" | "success" | "unavailable" | "error";
export type BusinessSource = "local" | "erp";

export interface BusinessResult<T> {
  status: AsyncStatus;
  source: BusinessSource;
  data?: T;
  message?: string;
  updatedAt?: string;
}

export interface BusinessContext {
  warehouseId: string;
  userId?: string;
  tenantId?: string;
  requestId: string;
}

export interface MaterialRequirement {
  lineId: string;
  materialKey: string;
  specKey: string;
  materialCode?: string;
  name: string;
  spec: string;
  color?: string;
  finish?: string;
  qty: number;
  unit: string;
  mappingStatus: "matched" | "unmatched" | "pending";
}

export interface InventoryAvailability {
  lineId?: string;
  materialKey: string;
  specKey: string;
  color?: string;
  finish?: string;
  materialCode: string;
  warehouseId: string;
  requestedQty: number;
  availableQty: number;
  reservedQty: number;
  shortageQty: number;
  status: "available" | "partial" | "shortage" | "unknown";
  updatedAt?: string;
}

export interface ProductionOrderDraft {
  clientRequestId: string;
  warehouseId: string;
  configVersion: "4.22.0";
  configSnapshot: CabinetConfig;
  bomSnapshot: BomItem[];
  requirements: MaterialRequirement[];
  note?: string;
}

export interface ProductionOrderResult {
  status: "queued" | "submitted" | "accepted" | "rejected";
  localOperationId: string;
  erpOrderId?: string;
  message?: string;
}

export type PendingOperationStatus = "pending" | "syncing" | "failed" | "completed";

export interface PendingProductionOrderOperation {
  operationId: string;
  type: "createProductionOrder";
  idempotencyKey: string;
  payload: ProductionOrderDraft;
  createdAt: string;
  updatedAt: string;
  retryCount: number;
  status: PendingOperationStatus;
  lastError?: string;
  result?: ProductionOrderResult;
}

export interface RetryPendingOperationsResult {
  attempted: number;
  completed: number;
  remaining: number;
}

export interface BusinessAdapter {
  readonly source: BusinessSource;
  resolveMaterials(bom: BomItem[]): Promise<BusinessResult<MaterialRequirement[]>>;
  checkInventory(requirements: MaterialRequirement[], context: BusinessContext): Promise<BusinessResult<InventoryAvailability[]>>;
  createProductionOrder(draft: ProductionOrderDraft, context: BusinessContext): Promise<BusinessResult<ProductionOrderResult>>;
  getProductionOrder(id: string, context: BusinessContext): Promise<BusinessResult<ProductionOrderResult>>;
  retryPendingOperations(): Promise<BusinessResult<RetryPendingOperationsResult>>;
}
