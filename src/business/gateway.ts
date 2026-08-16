import type { BomItem } from "../model";
import { HttpErpAdapter } from "./adapters";
import {
  createBrowserBusinessStorage,
  readBusinessContext,
  writeBusinessContext,
  type BusinessStorage
} from "./storage";
import type {
  BusinessAdapter,
  BusinessContext,
  BusinessResult,
  InventoryAvailability,
  MaterialRequirement,
  ProductionOrderDraft
} from "./types";

export const ERP_FEATURES = {
  warehouseContext: true,
  inventorySummary: true,
  productionOrder: false
} as const;

export const DEFAULT_WAREHOUSE_ID = "warehouse-default";

export class BusinessGateway {
  private context: BusinessContext;

  constructor(
    private readonly adapter: BusinessAdapter,
    private readonly storage: BusinessStorage,
    defaultWarehouseId = DEFAULT_WAREHOUSE_ID
  ) {
    this.context = readBusinessContext(storage) ?? {
      warehouseId: defaultWarehouseId,
      requestId: createBusinessRequestId("session")
    };
    writeBusinessContext(this.storage, this.context);
  }

  getSource() {
    return this.adapter.source;
  }

  getContext(): BusinessContext {
    return { ...this.context };
  }

  setContext(context: BusinessContext): BusinessContext {
    this.context = { ...context };
    writeBusinessContext(this.storage, this.context);
    return this.getContext();
  }

  setWarehouse(warehouseId: string): BusinessContext {
    return this.setContext({
      ...this.context,
      warehouseId,
      requestId: createBusinessRequestId("warehouse")
    });
  }

  resolveMaterials(bom: BomItem[]) {
    return this.adapter.resolveMaterials(bom);
  }

  checkInventory(requirements: MaterialRequirement[], context = this.getContext()) {
    return this.adapter.checkInventory(requirements, context);
  }

  createProductionOrder(draft: ProductionOrderDraft, context = this.getContext()) {
    return this.adapter.createProductionOrder(draft, context);
  }

  getProductionOrder(id: string, context = this.getContext()) {
    return this.adapter.getProductionOrder(id, context);
  }

  retryPendingOperations() {
    return this.adapter.retryPendingOperations();
  }

  async resolveInventory(
    bom: BomItem[],
    context = this.getContext()
  ): Promise<BusinessResult<InventoryAvailability[]>> {
    const materials = await this.resolveMaterials(bom);
    if (!materials.data) {
      return {
        status: materials.status,
        source: materials.source,
        message: materials.message,
        updatedAt: materials.updatedAt
      };
    }
    return this.checkInventory(materials.data, context);
  }
}

export function createBusinessGateway(options: {
  adapter?: BusinessAdapter;
  storage?: BusinessStorage;
  defaultWarehouseId?: string;
} = {}) {
  const storage = options.storage ?? createBrowserBusinessStorage();
  const adapter = options.adapter ?? new HttpErpAdapter(storage);
  return new BusinessGateway(adapter, storage, options.defaultWarehouseId);
}

export function createBusinessRequestId(prefix = "request") {
  const randomId = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  return prefix + "-" + randomId;
}

export const businessGateway = createBusinessGateway();
