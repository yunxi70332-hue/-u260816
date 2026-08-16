import type { BusinessContext, PendingProductionOrderOperation } from "./types";

export const BUSINESS_CONTEXT_STORAGE_KEY = "usm-business-context-v1";
export const PENDING_OPERATIONS_STORAGE_KEY = "usm-erp-sync-queue-v1";

export interface BusinessStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryBusinessStorage implements BusinessStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

export function createBrowserBusinessStorage(): BusinessStorage {
  if (typeof globalThis !== "undefined" && "localStorage" in globalThis) {
    return globalThis.localStorage as BusinessStorage;
  }
  return new MemoryBusinessStorage();
}

export function readBusinessContext(storage: BusinessStorage): BusinessContext | null {
  return readJson<BusinessContext | null>(storage, BUSINESS_CONTEXT_STORAGE_KEY, null);
}

export function writeBusinessContext(storage: BusinessStorage, context: BusinessContext) {
  storage.setItem(BUSINESS_CONTEXT_STORAGE_KEY, JSON.stringify(context));
}

export function readPendingOperations(storage: BusinessStorage): PendingProductionOrderOperation[] {
  return readJson<PendingProductionOrderOperation[]>(storage, PENDING_OPERATIONS_STORAGE_KEY, []);
}

export function writePendingOperations(storage: BusinessStorage, operations: PendingProductionOrderOperation[]) {
  storage.setItem(PENDING_OPERATIONS_STORAGE_KEY, JSON.stringify(operations));
}

function readJson<T>(storage: BusinessStorage, key: string, fallback: T): T {
  try {
    const stored = storage.getItem(key);
    return stored ? JSON.parse(stored) as T : fallback;
  } catch {
    return fallback;
  }
}
