import { randomUUID } from "node:crypto";
import type {
  AccountStatus,
  AccountAuthorization,
  AccountSummary,
  AuthorizationSnapshot,
  AssignOrderInput,
  Attachment,
  AuditLog,
  CreateAttachmentInput,
  CreateCustomerInput,
  CreateDealerInput,
  CreateDesignInput,
  CreateEmployeeInput,
  CreateOrganizationAdminInput,
  CreateOrderFollowUpInput,
  CreatePriceListInput,
  ClonePriceListInput,
  CreateProjectInput,
  CreateShipmentInput,
  Customer,
  Dealer,
  Design,
  DesignVersion,
  Employee,
  EmployeeFollowUpSummary,
  EmployeeOrderSummary,
  Order,
  OrderAssignment,
  OrderFollowUp,
  OrderStatus,
  PriceList,
  PriceListItem,
  PriceListValidation,
  Project,
  Quote,
  QuoteStatus,
  SalesPricingPreference,
  Shipment,
  SavePriceListItemInput,
  Template,
  TemplateVersion,
  UpdateAccountAuthorizationInput,
  UpdateOrganizationEntitlementsInput,
  OrganizationEntitlement,
  PermissionGrant,
  Warehouse,
  CreateWarehouseInput,
  MaterialVariant,
  CreateMaterialVariantInput,
  InventoryBalance,
  InventoryLedger,
  StockDocument,
  CreateStockDocumentInput,
  InventoryReservation,
  CreateInventoryReservationInput,
  MaterialImportPreviewInput,
  MaterialImportCommitInput
} from "@usm/contracts";
import { snapshotDesignDraft } from "@usm/domain";
import { DEFAULT_CONFIG } from "../../../src/model.js";
import { AppError, VersionConflictError } from "./errors.js";
import type { AuditInput, AuthMembership, IdempotencyRecord, LoginLogInput, LoginLogQuery, LoginLogSummary, Repository } from "./repository.js";
import { recalculateDesignSnapshot } from "./services/configurator.js";
import { buildLegacyPriceCatalog } from "./services/price-calculator.js";
import { calculateAuthorization, dataScopeAllowsDelegation, DEALER_MODULES, ERP_MODULES, defaultEnabledModules, isPermissionAllowedForOrganization, legacyPermissionsForRole, platformAuthorization } from "./authorization.js";

const now = () => new Date().toISOString();
const clone = <T>(value: T): T => structuredClone(value);
const materialKey = (value: { materialKey: string; specKey: string; color?: string; finish?: string }): string => [value.materialKey, value.specKey, value.color ?? "", value.finish ?? ""].join("\u0000");
const materialIdentity = materialKey;
const materialImportBatchRoute = "material-import-batch";
const optionalImportText = (value: unknown): string | undefined => {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
};
const optionalImportNumber = (value: unknown): number | undefined => value === undefined || value === null || value === "" ? undefined : Number(value);
const optionalImportBoolean = (value: unknown): boolean | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value).trim().toLocaleLowerCase();
  if (["true", "1", "yes", "y", "active", "enabled", "启用", "是"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "inactive", "disabled", "停用", "禁用", "否"].includes(normalized)) return false;
  return undefined;
};
const derivedMaterialCode = (value: { materialKey: string; specKey: string; color?: string; finish?: string }): string => {
  const code = [value.materialKey, value.specKey, value.color, value.finish]
    .map((part) => String(part ?? "").trim().replace(/[^\p{L}\p{N}]+/gu, "-"))
    .filter(Boolean)
    .join("-");
  return (code || value.materialKey).slice(0, 100);
};

function ensureRevision(actual: number, expected: number): void {
  if (actual !== expected) throw new VersionConflictError(actual);
}

export class MemoryRepository implements Repository {
  readonly mode = "memory" as const;
  private readonly tenant = {
    id: "tenant-demo", name: "USM 本地演示", slug: "usm-local",
    organizationType: "hq" as const, parentOrganizationId: null
  };
  private customers = new Map<string, Customer>();
  private projects = new Map<string, Project>();
  private templates = new Map<string, Template>();
  private designs = new Map<string, Design>();
  private designVersions = new Map<string, DesignVersion>();
  private quotes = new Map<string, Quote>();
  private orders = new Map<string, Order>();
  private dealers = new Map<string, Dealer>();
  private accounts = new Map<string, AccountSummary>();
  private orderAssignments = new Map<string, OrderAssignment>();
  private orderFollowUps = new Map<string, OrderFollowUp>();
  private priceLists = new Map<string, PriceList>();
  private priceListItems = new Map<string, PriceListItem>();
  private shipments = new Map<string, Shipment>();
  private attachments = new Map<string, Attachment>();
  private audit: AuditLog[] = [];
  private loginLogs: LoginLogSummary[] = [];
  private passwordChangeRequired = new Set<string>();
  private permissionGrants = new Map<string, PermissionGrant[]>();
  private dataScopes = new Map<string, Array<{ resource: string; scope: "own" | "assigned" | "specified" | "organization"; assignedUserIds: string[] }>>();
  private entitlements = new Map<string, OrganizationEntitlement[]>();
  private idempotency = new Map<string, IdempotencyRecord>();
  private counters = new Map<string, number>();
  private warehouses = new Map<string, Warehouse>();
  private materials = new Map<string, MaterialVariant>();
  private balances = new Map<string, InventoryBalance>();
  private inventoryLedger: InventoryLedger[] = [];
  private stockDocuments = new Map<string, StockDocument>();
  private reservations = new Map<string, InventoryReservation>();
  private salesPricingPreferences = new Map<string, SalesPricingPreference>();

  constructor() {
    const createdAt = now();
    const calculated = recalculateDesignSnapshot(structuredClone(DEFAULT_CONFIG) as unknown as Record<string, unknown>);
    const version: TemplateVersion = {
      id: "template-version-demo-1",
      templateId: "template-demo",
      version: 1,
      name: "基础双列柜",
      configSnapshot: calculated.configSnapshot,
      bomSnapshot: calculated.bomSnapshot,
      pricingSnapshot: calculated.pricingSnapshot,
      publishedAt: createdAt,
      createdAt
    };
    this.templates.set("template-demo", {
      id: "template-demo",
      tenantId: this.tenant.id,
      code: "TPL-0001",
      name: "基础双列柜",
      description: "开发模式示例模板",
      status: "published",
      latestVersion: version,
      revision: 1,
      createdAt,
      updatedAt: createdAt
    });
    this.seedOperationalData(createdAt, calculated, version.id);
    this.entitlements.set(this.tenant.id, ERP_MODULES.map((module) => ({ module, enabled: true, permissionAllowlist: null })));
  }

  async resolveMembership(userId: string, preferredTenantId?: string): Promise<AuthMembership | null> {
    if (userId === "user-demo" && (!preferredTenantId || preferredTenantId === this.tenant.id)) {
      return { tenant: clone(this.tenant), role: "headquarters_admin", organizationType: "hq" };
    }
    const account = [...this.accounts.values()].find((item) => item.userId === userId && (!preferredTenantId || item.tenantId === preferredTenantId));
    if (!account || account.status === "disabled") return null;
    if (account.tenantId === this.tenant.id) return { tenant: clone(this.tenant), role: account.role, organizationType: "hq" };
    const dealer = [...this.dealers.values()].find((item) => item.organizationId === account.tenantId);
    if (!dealer) return null;
    return { tenant: { id: dealer.organizationId, name: dealer.name, slug: dealer.code.toLowerCase() }, role: account.role, organizationType: "dealer" };
  }

  async listAvailableTenants(userId: string, includeAllOrganizations = false): Promise<Array<{ id: string; name: string; slug: string }>> {
    if (includeAllOrganizations && userId === "user-demo") {
      return [clone(this.tenant), ...[...this.dealers.values()].map((dealer) => ({
        id: dealer.organizationId,
        name: dealer.name,
        slug: dealer.code.toLowerCase()
      }))];
    }
    const tenantIds = new Set([...this.accounts.values()]
      .filter((account) => account.userId === userId && account.status === "active")
      .map((account) => account.tenantId));
    if (userId === "user-demo") tenantIds.add(this.tenant.id);
    return [...tenantIds].flatMap((tenantId) => {
      if (tenantId === this.tenant.id) return [clone(this.tenant)];
      const dealer = [...this.dealers.values()].find((item) => item.organizationId === tenantId);
      return dealer ? [{ id: dealer.organizationId, name: dealer.name, slug: dealer.code.toLowerCase() }] : [];
    });
  }

  async getAuthorization(userId: string, tenantId: string, role?: import("@usm/contracts").Role): Promise<AuthorizationSnapshot> {
    if (userId === "user-demo") return platformAuthorization();
    const account = [...this.accounts.values()].find((item) => item.userId === userId && item.tenantId === tenantId);
    const resolvedRole = role ?? account?.role ?? "member";
    const organizationType = tenantId === this.tenant.id ? "hq" : "dealer";
    const grants = this.permissionGrants.get(`${tenantId}:${userId}`);
    const authorization = calculateAuthorization({ role: resolvedRole, organizationType, grants, dataScopes: this.dataScopes.get(`${tenantId}:${userId}`), entitlements: this.entitlements.get(tenantId)?.map((item) => ({ ...item, permissionAllowlist: item.permissionAllowlist })) });
    return authorization;
  }

  async getUserSecurityState(userId: string): Promise<{ globalRole: string; mustChangePassword: boolean }> {
    return { globalRole: userId === "user-demo" ? "admin" : "user", mustChangePassword: this.passwordChangeRequired.has(userId) };
  }

  async setPasswordChangeRequired(userId: string, required: boolean): Promise<void> {
    if (required) this.passwordChangeRequired.add(userId);
    else this.passwordChangeRequired.delete(userId);
  }

  async getAccountAuthorization(tenantId: string, accountId: string): Promise<AccountAuthorization | null> {
    const account = this.accounts.get(accountId);
    if (!account || account.tenantId !== tenantId) return null;
    const authorization = await this.getAuthorization(account.userId, tenantId, account.role);
    return { ...authorization, accountId: account.id, userId: account.userId, grants: this.permissionGrants.get(`${tenantId}:${account.userId}`) ?? [] };
  }

  async previewAccountAuthorization(tenantId: string, accountId: string, input: UpdateAccountAuthorizationInput): Promise<AccountAuthorization | null> {
    const account = this.accounts.get(accountId);
    if (!account || account.tenantId !== tenantId) return null;
    const dataScopes = [...new Map(input.dataScopes.map((scope) => [scope.resource, scope])).values()];
    const authorization = calculateAuthorization({
      role: account.role,
      organizationType: tenantId === this.tenant.id ? "hq" : "dealer",
      grants: input.grants,
      dataScopes,
      entitlements: this.entitlements.get(tenantId)
    });
    return { ...authorization, accountId: account.id, userId: account.userId, grants: input.grants };
  }

  async updateAccountAuthorization(tenantId: string, accountId: string, input: UpdateAccountAuthorizationInput, actorUserId: string): Promise<AccountAuthorization> {
    const account = this.accounts.get(accountId);
    if (!account || account.tenantId !== tenantId) throw new AppError(404, "NOT_FOUND", "Account not found");
    const dataScopes = [...new Map(input.dataScopes.map((scope) => [scope.resource, scope])).values()];
    const actor = await this.getAuthorization(actorUserId, tenantId);
    const entitlements = this.entitlements.get(tenantId) ?? [];
    const candidate = calculateAuthorization({ role: account.role, organizationType: tenantId === this.tenant.id ? "hq" : "dealer", grants: input.grants, dataScopes, entitlements: entitlements.map((item) => ({ ...item, permissionAllowlist: item.permissionAllowlist })) });
    if (!actor.effectivePermissions.includes("permission.delegate")) throw new AppError(403, "FORBIDDEN", "Permission delegation is not allowed");
    const organizationType = tenantId === this.tenant.id ? "hq" : "dealer";
    const boundaryViolations = input.grants.map((grant) => grant.permission).filter((permission) => !isPermissionAllowedForOrganization(permission, organizationType));
    if (boundaryViolations.length) throw new AppError(403, "FORBIDDEN", "The target organization cannot grant these permissions", boundaryViolations);
    const unauthorized = candidate.effectivePermissions.filter((permission) => !actor.delegablePermissions.includes(permission));
    if (unauthorized.length) throw new AppError(403, "FORBIDDEN", "You cannot grant permissions outside your delegation scope", unauthorized);
    const requestedScopes = new Map(dataScopes.map((scope) => [scope.resource, scope]));
    for (const grant of input.grants) {
      const resource = grant.permission.split(".")[0];
      const requested = requestedScopes.get(resource) ?? { resource, scope: grant.scope, assignedUserIds: grant.assignedUserIds };
      if (!dataScopeAllowsDelegation(actor, resource, requested)) {
        throw new AppError(403, "FORBIDDEN", "You cannot grant a broader data scope than your own", { resource, scope: requested.scope });
      }
    }
    for (const requested of dataScopes) {
      if (!dataScopeAllowsDelegation(actor, requested.resource, requested)) {
        throw new AppError(403, "FORBIDDEN", "You cannot grant a broader data scope than your own", requested);
      }
    }
    await this.ensurePermissionAdministrator(tenantId, account.id, { ...input, dataScopes });
    const before = await this.getAccountAuthorization(tenantId, accountId);
    this.permissionGrants.set(`${tenantId}:${account.userId}`, input.grants);
    this.dataScopes.set(`${tenantId}:${account.userId}`, dataScopes);
    await this.recordAudit({
      tenantId,
      actorUserId,
      action: "account.authorization.updated",
      entityType: "account",
      entityId: account.id,
      requestId: `authorization-${randomUUID()}`,
      before: { grants: before?.grants ?? [] },
      after: { grants: input.grants, dataScopes }
    });
    const updated = await this.getAccountAuthorization(tenantId, accountId);
    if (!updated) throw new AppError(500, "INTERNAL_ERROR", "Authorization update failed");
    return updated;
  }

  private async ensurePermissionAdministrator(tenantId: string, changingAccountId: string, input: UpdateAccountAuthorizationInput): Promise<void> {
    const organizationType = tenantId === this.tenant.id ? "hq" : "dealer" as const;
    const entitlements = this.entitlements.get(tenantId) ?? [];
    const accountsModuleEnabled = entitlements.some((item) => item.module === "accounts" && item.enabled);
    if (!accountsModuleEnabled) return;
    for (const candidate of this.accounts.values()) {
      if (candidate.tenantId !== tenantId || candidate.status !== "active") continue;
      const grants = candidate.id === changingAccountId ? input.grants : this.permissionGrants.get(`${tenantId}:${candidate.userId}`);
      const authorization = calculateAuthorization({
        role: candidate.role,
        organizationType,
        grants,
        dataScopes: candidate.id === changingAccountId ? input.dataScopes : this.dataScopes.get(`${tenantId}:${candidate.userId}`),
        entitlements
      });
      if (authorization.effectivePermissions.includes("account.manage") && authorization.effectivePermissions.includes("permission.delegate")) return;
    }
    throw new AppError(409, "VALIDATION_ERROR", "At least one active permission administrator is required");
  }

  async listOrganizationEntitlements(tenantId: string): Promise<OrganizationEntitlement[]> {
    const current = this.entitlements.get(tenantId);
    if (current) return clone(current);
    const organizationType = tenantId === this.tenant.id ? "hq" : "dealer";
    const enabled = new Set(defaultEnabledModules(organizationType));
    return ERP_MODULES.map((module) => ({ module, enabled: enabled.has(module), permissionAllowlist: null }));
  }

  async updateOrganizationEntitlements(tenantId: string, input: UpdateOrganizationEntitlementsInput, actorUserId: string): Promise<OrganizationEntitlement[]> {
    const actor = await this.getAuthorization(actorUserId, tenantId);
    if (!actor.effectivePermissions.includes("platform.entitlements.manage")) throw new AppError(403, "FORBIDDEN", "Organization entitlement management is not allowed");
    const before = await this.listOrganizationEntitlements(tenantId);
    this.entitlements.set(tenantId, clone(input.entitlements));
    await this.recordAudit({
      tenantId, actorUserId, action: "organization.entitlements.updated", entityType: "organization", entityId: tenantId,
      requestId: `authorization-${randomUUID()}`, before: { entitlements: before }, after: { entitlements: input.entitlements }
    });
    return clone(input.entitlements);
  }

  async listTemplates(tenantId: string) { return this.values(this.templates, tenantId); }
  async getTemplate(tenantId: string, id: string) { return this.get(this.templates, tenantId, id); }

  async listWarehouses(tenantId: string): Promise<Warehouse[]> { return this.values(this.warehouses, tenantId); }

  async createWarehouse(tenantId: string, input: CreateWarehouseInput): Promise<Warehouse> {
    const stamp = now();
    const existing = [...this.warehouses.values()].find((item) => item.tenantId === tenantId && item.code === input.code);
    if (existing) return clone(existing);
    const item: Warehouse = { id: randomUUID(), tenantId, code: input.code, name: input.name, isDefault: input.isDefault ?? this.warehousesForTenant(tenantId).length === 0, revision: 1, createdAt: stamp, updatedAt: stamp };
    if (item.isDefault) {
      for (const warehouse of this.warehousesForTenant(tenantId)) this.warehouses.set(warehouse.id, { ...warehouse, isDefault: false, updatedAt: stamp });
    }
    this.warehouses.set(item.id, item);
    return clone(item);
  }

  async listMaterials(tenantId: string, search?: string): Promise<MaterialVariant[]> {
    const needle = search?.trim().toLowerCase();
    return this.values(this.materials, tenantId).filter((item) => !needle || [item.materialCode ?? "", item.materialKey, item.specKey, item.category, item.color, item.finish, item.name, item.specification].some((value) => value.toLowerCase().includes(needle)));
  }

  async getMaterialByKey(tenantId: string, key: Pick<MaterialVariant, "materialKey" | "specKey" | "color" | "finish">): Promise<MaterialVariant | null> {
    const item = [...this.materials.values()].find((candidate) => candidate.tenantId === tenantId && materialKey(candidate) === materialKey(key));
    return item ? clone(item) : null;
  }

  async createMaterial(tenantId: string, input: CreateMaterialVariantInput): Promise<MaterialVariant> {
    const existing = await this.getMaterialByKey(tenantId, { materialKey: input.materialKey, specKey: input.specKey, color: input.color ?? "", finish: input.finish ?? "" });
    if (existing) {
      const updated: MaterialVariant = {
        ...existing,
        materialCode: input.materialCode ?? existing.materialCode ?? derivedMaterialCode(input),
        category: input.category ?? existing.category,
        name: input.name,
        specification: input.specification ?? existing.specification,
        unit: input.unit ?? existing.unit,
        weightKg: input.weightKg === undefined ? existing.weightKg : input.weightKg,
        referenceCostMinor: input.referenceCostMinor === undefined ? existing.referenceCostMinor : input.referenceCostMinor,
        note: input.note ?? existing.note,
        source: input.source ?? existing.source,
        active: input.active ?? existing.active,
        revision: existing.revision + 1,
        updatedAt: now()
      };
      this.materials.set(updated.id, updated);
      return clone(updated);
    }
    const stamp = now();
    const item: MaterialVariant = {
      id: randomUUID(), tenantId, materialCode: input.materialCode ?? derivedMaterialCode(input),
      materialKey: input.materialKey, specKey: input.specKey, category: input.category ?? "",
      color: input.color ?? "", finish: input.finish ?? "", name: input.name,
      specification: input.specification ?? "", unit: input.unit ?? "pcs",
      weightKg: input.weightKg ?? null, referenceCostMinor: input.referenceCostMinor ?? null,
      note: input.note ?? "", source: input.source ?? "", active: input.active ?? true,
      revision: 1, createdAt: stamp, updatedAt: stamp
    };
    this.materials.set(item.id, item);
    return clone(item);
  }

  async listInventoryBalances(tenantId: string, warehouseId?: string, materialIds?: string[]): Promise<InventoryBalance[]> {
    return [...this.balances.values()].filter((item) => item.tenantId === tenantId && (!warehouseId || item.warehouseId === warehouseId) && (!materialIds?.length || materialIds.includes(item.materialId))).map(clone);
  }

  async listInventoryLedger(tenantId: string, warehouseId?: string, materialId?: string): Promise<InventoryLedger[]> {
    return clone(this.inventoryLedger.filter((item) => item.tenantId === tenantId && (!warehouseId || item.warehouseId === warehouseId) && (!materialId || item.materialId === materialId)));
  }
  async listStockDocuments(tenantId: string, type?: StockDocument["type"]): Promise<StockDocument[]> {
    return this.values(this.stockDocuments, tenantId).filter((item) => !type || item.type === type);
  }
  async listInventoryReservations(tenantId: string, orderId?: string): Promise<InventoryReservation[]> {
    return [...this.reservations.values()]
      .filter((item) => item.tenantId === tenantId && (!orderId || item.orderId === orderId))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(clone);
  }

  async createStockDocument(tenantId: string, input: CreateStockDocumentInput, actorUserId: string): Promise<StockDocument> {
    const warehouse = await this.ensureWarehouse(tenantId, input.warehouseId);
    if (input.type === "transfer" && !input.targetWarehouseId) throw new AppError(422, "VALIDATION_ERROR", "targetWarehouseId is required for transfer");
    const lines = [];
    for (const line of input.lines) {
      const material = line.materialId ? this.required(this.materials, tenantId, line.materialId, "Material") : await this.getMaterialByKey(tenantId, { materialKey: line.materialKey, specKey: line.specKey, color: line.color ?? "", finish: line.finish ?? "" });
      if (!material) throw new AppError(422, "VALIDATION_ERROR", `Unknown material variant: ${line.materialKey}/${line.specKey}`);
      lines.push({ ...line, materialId: material.id, color: line.color ?? "", finish: line.finish ?? "" });
    }
    const stamp = now();
    const item: StockDocument = { id: randomUUID(), tenantId, code: this.code("STK"), type: input.type, status: "draft", warehouseId: warehouse.id, targetWarehouseId: input.targetWarehouseId ?? null, orderId: input.orderId ?? null, sourceBatchId: input.sourceBatchId ?? null, note: input.note ?? null, lines, postedAt: null, postedByUserId: null, revision: 1, createdAt: stamp, updatedAt: stamp };
    this.stockDocuments.set(item.id, item);
    return clone(item);
  }

  async postStockDocument(tenantId: string, id: string, actorUserId: string): Promise<StockDocument> {
    const item = this.required(this.stockDocuments, tenantId, id, "Stock document");
    if (item.status !== "draft") throw new AppError(409, "INVALID_TRANSITION", "Only draft stock documents can be posted");
    const sourceBalances = item.lines.map((line) => this.balanceFor(tenantId, item.warehouseId, line.materialId!));
    if (item.type === "issue" || item.type === "transfer") {
      for (let index = 0; index < item.lines.length; index += 1) {
        const balance = sourceBalances[index];
        const reservedRelease = item.orderId && item.type === "issue" ? Math.min(balance.reservedQty, item.lines[index].qty) : 0;
        const availableAfterReservation = balance.availableQty + reservedRelease;
        if (availableAfterReservation < item.lines[index].qty) throw new AppError(409, "VALIDATION_ERROR", `Insufficient inventory for ${item.lines[index].materialKey}`, { availableQty: availableAfterReservation, requestedQty: item.lines[index].qty });
      }
    }
    for (let index = 0; index < item.lines.length; index += 1) {
      const line = item.lines[index];
      const delta = item.type === "issue" || item.type === "transfer" ? -line.qty : line.qty;
      if (item.type === "issue" && item.orderId) {
        const balance = this.balanceFor(tenantId, item.warehouseId, line.materialId!);
        const reservedRelease = Math.min(balance.reservedQty, line.qty);
        if (reservedRelease > 0) this.applyReserved(tenantId, item.warehouseId, line.materialId!, -reservedRelease);
      }
      this.applyBalance(tenantId, item.warehouseId, line.materialId!, delta);
      this.appendLedger(tenantId, item.warehouseId, line.materialId!, item.type === "adjust" ? "adjust" : delta > 0 ? "receive" : "issue", line.qty, delta, item.id, actorUserId, item.note);
      if (item.type === "transfer") {
        const target = await this.ensureWarehouse(tenantId, item.targetWarehouseId!);
        this.applyBalance(tenantId, target.id, line.materialId!, line.qty);
        this.appendLedger(tenantId, target.id, line.materialId!, "receive", line.qty, line.qty, item.id, actorUserId, item.note);
      }
    }
    const updated: StockDocument = { ...item, status: "posted", postedAt: now(), postedByUserId: actorUserId, revision: item.revision + 1, updatedAt: now() };
    this.stockDocuments.set(id, updated);
    return clone(updated);
  }

  async reverseStockDocument(tenantId: string, id: string, actorUserId: string): Promise<StockDocument> {
    const item = this.required(this.stockDocuments, tenantId, id, "Stock document");
    if (item.status !== "posted") throw new AppError(409, "INVALID_TRANSITION", "Only posted stock documents can be reversed");
    for (const line of item.lines) {
      const delta = item.type === "issue" || item.type === "transfer" ? line.qty : -line.qty;
      const balance = this.balanceFor(tenantId, item.warehouseId, line.materialId!);
      if (delta < 0 && balance.onHandQty + delta < 0) throw new AppError(409, "VALIDATION_ERROR", "Cannot reverse below zero on-hand quantity");
      this.applyBalance(tenantId, item.warehouseId, line.materialId!, delta);
      this.appendLedger(tenantId, item.warehouseId, line.materialId!, "reverse", line.qty, delta, item.id, actorUserId, item.note);
      if (item.type === "transfer" && item.targetWarehouseId) {
        this.applyBalance(tenantId, item.targetWarehouseId, line.materialId!, -line.qty);
        this.appendLedger(tenantId, item.targetWarehouseId, line.materialId!, "reverse", line.qty, -line.qty, item.id, actorUserId, item.note);
      }
    }
    const updated = { ...item, status: "reversed" as const, revision: item.revision + 1, updatedAt: now() };
    this.stockDocuments.set(id, updated);
    return clone(updated);
  }

  async createInventoryReservation(tenantId: string, input: CreateInventoryReservationInput, actorUserId: string): Promise<InventoryReservation[]> {
    const warehouse = await this.ensureWarehouse(tenantId, input.warehouseId);
    const resolved = [] as Array<{ material: MaterialVariant; qty: number }>;
    for (const req of input.requirements) {
      const material = req.materialId ? this.required(this.materials, tenantId, req.materialId, "Material") : await this.getMaterialByKey(tenantId, { materialKey: req.materialKey, specKey: req.specKey, color: req.color ?? "", finish: req.finish ?? "" });
      if (!material) throw new AppError(422, "VALIDATION_ERROR", `Unknown material variant: ${req.materialKey}/${req.specKey}`);
      resolved.push({ material, qty: req.qty });
    }
    for (const req of resolved) {
      const balance = this.balanceFor(tenantId, warehouse.id, req.material.id);
      if (balance.availableQty < req.qty) throw new AppError(409, "VALIDATION_ERROR", `Insufficient inventory for ${req.material.materialKey}`, { availableQty: balance.availableQty, requestedQty: req.qty });
    }
    const result: InventoryReservation[] = [];
    for (const req of resolved) {
      const item: InventoryReservation = { id: randomUUID(), tenantId, orderId: input.orderId, warehouseId: warehouse.id, materialId: req.material.id, qty: req.qty, issuedQty: 0, releasedQty: 0, status: "active", revision: 1, createdAt: now(), updatedAt: now() };
      this.reservations.set(item.id, item);
      this.applyReserved(tenantId, warehouse.id, req.material.id, req.qty);
      this.appendLedger(tenantId, warehouse.id, req.material.id, "reserve", req.qty, 0, item.orderId, actorUserId, "order reservation");
      result.push(item);
    }
    return clone(result);
  }

  async issueInventoryReservation(tenantId: string, input: CreateInventoryReservationInput, actorUserId: string): Promise<{ document: StockDocument; reservations: InventoryReservation[] }> {
    const warehouse = await this.ensureWarehouse(tenantId, input.warehouseId);
    const lines: StockDocument["lines"] = [];
    for (const requirement of input.requirements) {
      const material = requirement.materialId
        ? this.required(this.materials, tenantId, requirement.materialId, "Material")
        : await this.getMaterialByKey(tenantId, { materialKey: requirement.materialKey, specKey: requirement.specKey, color: requirement.color ?? "", finish: requirement.finish ?? "" });
      if (!material) throw new AppError(422, "VALIDATION_ERROR", `Unknown material variant: ${requirement.materialKey}/${requirement.specKey}`);
      lines.push({
        materialId: material.id,
        materialKey: requirement.materialKey,
        specKey: requirement.specKey,
        color: requirement.color ?? "",
        finish: requirement.finish ?? "",
        qty: requirement.qty
      });
    }

    const stamp = now();
    const plannedReservations = new Map<string, InventoryReservation>();
    const plannedBalances = new Map<string, InventoryBalance>();
    const touchedReservationIds: string[] = [];
    for (const line of lines) {
      let remaining = line.qty;
      for (const reservation of this.reservations.values()) {
        const current = plannedReservations.get(reservation.id) ?? reservation;
        if (remaining <= 0 || current.tenantId !== tenantId || current.orderId !== input.orderId || current.warehouseId !== warehouse.id || current.materialId !== line.materialId || current.status !== "active") continue;
        const issuable = Math.min(remaining, Math.max(0, current.qty - current.issuedQty - current.releasedQty));
        if (!issuable) continue;
        const issuedQty = current.issuedQty + issuable;
        const updated: InventoryReservation = {
          ...current, issuedQty,
          status: issuedQty + current.releasedQty >= current.qty ? "consumed" : "active",
          revision: current.revision + 1, updatedAt: stamp
        };
        plannedReservations.set(current.id, updated);
        if (!touchedReservationIds.includes(current.id)) touchedReservationIds.push(current.id);
        remaining -= issuable;
      }

      const reservedRelease = line.qty - remaining;
      const balanceKey = `${tenantId}:${warehouse.id}:${line.materialId}`;
      const balance = plannedBalances.get(balanceKey) ?? this.balances.get(balanceKey);
      const availableAfterReservation = balance ? balance.onHandQty - (balance.reservedQty - reservedRelease) : 0;
      if (!balance || balance.reservedQty < reservedRelease || availableAfterReservation < line.qty) {
        throw new AppError(409, "VALIDATION_ERROR", `Insufficient inventory for ${line.materialKey}`, {
          availableQty: Math.max(0, availableAfterReservation), requestedQty: line.qty
        });
      }
      const onHandQty = balance.onHandQty - line.qty;
      const reservedQty = balance.reservedQty - reservedRelease;
      plannedBalances.set(balanceKey, {
        ...balance, onHandQty, reservedQty, availableQty: onHandQty - reservedQty,
        revision: balance.revision + 1, updatedAt: stamp
      });
    }

    const nextCounters = new Map(this.counters);
    const nextStockNumber = (nextCounters.get("STK") ?? 0) + 1;
    nextCounters.set("STK", nextStockNumber);
    const document: StockDocument = {
      id: randomUUID(), tenantId, code: `STK-${String(nextStockNumber).padStart(5, "0")}`,
      type: "issue", status: "posted", warehouseId: warehouse.id, targetWarehouseId: null,
      orderId: input.orderId, sourceBatchId: null, note: "order material issue", lines,
      postedAt: stamp, postedByUserId: actorUserId, revision: 2, createdAt: stamp, updatedAt: stamp
    };
    const nextReservations = new Map(this.reservations);
    for (const [id, reservation] of plannedReservations) nextReservations.set(id, reservation);
    const nextBalances = new Map(this.balances);
    for (const [key, balance] of plannedBalances) nextBalances.set(key, balance);
    const nextStockDocuments = new Map(this.stockDocuments);
    nextStockDocuments.set(document.id, document);
    const nextLedger = [...this.inventoryLedger];
    for (const line of lines) {
      nextLedger.unshift({
        id: randomUUID(), tenantId, warehouseId: warehouse.id, materialId: line.materialId!,
        direction: "issue", quantity: line.qty, deltaQty: -line.qty, referenceType: "stock_document",
        referenceId: document.id, note: document.note, actorUserId, revision: 1, createdAt: stamp, updatedAt: stamp
      });
    }

    this.counters = nextCounters;
    this.reservations = nextReservations;
    this.balances = nextBalances;
    this.stockDocuments = nextStockDocuments;
    this.inventoryLedger = nextLedger;
    return { document: clone(document), reservations: clone(touchedReservationIds.map((id) => nextReservations.get(id)!)) };
  }

  async releaseInventoryReservation(tenantId: string, orderId: string, actorUserId: string): Promise<InventoryReservation[]> {
    const result: InventoryReservation[] = [];
    for (const item of this.reservations.values()) {
      if (item.tenantId !== tenantId || item.orderId !== orderId || item.status !== "active") continue;
      const releasableQty = Math.max(0, item.qty - item.issuedQty - item.releasedQty);
      this.applyReserved(tenantId, item.warehouseId, item.materialId, -releasableQty);
      this.appendLedger(tenantId, item.warehouseId, item.materialId, "release", releasableQty, 0, item.orderId, actorUserId, "order reservation released");
      const updated = { ...item, releasedQty: item.releasedQty + releasableQty, status: "released" as const, revision: item.revision + 1, updatedAt: now() };
      this.reservations.set(item.id, updated);
      result.push(updated);
    }
    return clone(result);
  }

  async previewMaterialImport(tenantId: string, input: MaterialImportPreviewInput) {
    const materialRows = input.materialRows?.length ? input.materialRows : (input.rows ?? []);
    const openingRows = input.openingRows ?? [];
    const hasExplicitOpeningRows = Boolean(input.openingRows?.length);
    const normalizedMaterials: NonNullable<MaterialImportCommitInput["materialRows"]> = [];
    const normalizedOpeningRows: NonNullable<MaterialImportCommitInput["openingRows"]> = [];
    const errors: Array<{ sheet?: string; row: number; message: string }> = [];
    let created = 0; let updated = 0; let skipped = 0; let conflicts = 0;
    materialRows.forEach((raw, index) => {
      if (!raw || typeof raw !== "object") { errors.push({ sheet: "materials", row: index + 2, message: "Row must be an object" }); return; }
      const value = raw as Record<string, unknown>;
      const materialKeyValue = String(value.materialKey ?? value.materialCode ?? "").trim();
      const explicitMaterialCode = String(value.materialCode ?? "").trim();
      const materialCodeValue = explicitMaterialCode || derivedMaterialCode({ materialKey: materialKeyValue, specKey: String(value.specKey ?? value.spec ?? "").trim(), color: String(value.color ?? ""), finish: String(value.finish ?? "") });
      const specKeyValue = String(value.specKey ?? value.spec ?? "").trim();
      const name = String(value.name ?? materialKeyValue).trim();
      const openingQty = Number(value.openingQty ?? value.qty ?? 0);
      if (!materialCodeValue || !materialKeyValue || !specKeyValue || !name || !Number.isInteger(openingQty) || openingQty < 0) {
        errors.push({ sheet: "materials", row: index + 2, message: "materialCode, materialKey, specKey, name and non-negative integer openingQty are required" }); return;
      }
      const referenceCost = optionalImportNumber(value.referenceCost);
      const weightKg = optionalImportNumber(value.weightKg);
      const item = {
        materialCode: materialCodeValue, materialKey: materialKeyValue, specKey: specKeyValue,
        category: optionalImportText(value.category), color: optionalImportText(value.color), finish: optionalImportText(value.finish),
        name, specification: optionalImportText(value.specification ?? value.spec), unit: optionalImportText(value.unit),
        weightKg, referenceCost, active: optionalImportBoolean(value.active),
        note: optionalImportText(value.note), source: optionalImportText(value.source), openingQty
      };
      if ((weightKg !== undefined && (!Number.isFinite(weightKg) || weightKg < 0)) || (referenceCost !== undefined && (!Number.isFinite(referenceCost) || referenceCost < 0))) { errors.push({ sheet: "materials", row: index + 2, message: "weightKg and referenceCost must be non-negative numbers" }); return; }
      if (normalizedMaterials.some((candidate) => materialIdentity(candidate) === materialIdentity(item))) { conflicts += 1; return; }
      normalizedMaterials.push(item);
      if (!hasExplicitOpeningRows && openingQty > 0) normalizedOpeningRows.push({ warehouseCode: "MAIN", materialCode: materialCodeValue, openingQty, note: item.note || undefined });
      const existing = [...this.materials.values()].find((candidate) => candidate.tenantId === tenantId && (candidate.materialCode === item.materialCode || materialKey(candidate) === materialKey(item)));
      if (existing) updated += 1; else created += 1;
    });
    openingRows.forEach((raw, index) => {
      if (!raw || typeof raw !== "object") { errors.push({ sheet: "opening", row: index + 2, message: "Row must be an object" }); return; }
      const value = raw as Record<string, unknown>;
      const warehouseCode = String(value.warehouseCode ?? "").trim();
      const materialCode = String(value.materialCode ?? "").trim();
      const openingQty = Number(value.openingQty ?? value.qty ?? 0);
      if (!warehouseCode || !materialCode || !Number.isInteger(openingQty) || openingQty < 0) { errors.push({ sheet: "opening", row: index + 2, message: "warehouseCode, materialCode and non-negative integer openingQty are required" }); return; }
      normalizedOpeningRows.push({ warehouseCode, materialCode, openingQty, location: optionalImportText(value.location), batchNo: optionalImportText(value.batchNo), note: optionalImportText(value.note) });
    });
    if (!normalizedMaterials.length && !normalizedOpeningRows.length && !errors.length) skipped = materialRows.length + openingRows.length;
    return { materialRows: normalizedMaterials, openingRows: normalizedOpeningRows, created, updated, skipped, conflicts, errors };
  }

  async commitMaterialImport(tenantId: string, input: MaterialImportCommitInput, actorUserId: string) {
    if (input.batchId) {
      const existingBatch = await this.getIdempotency(tenantId, materialImportBatchRoute, input.batchId);
      if (existingBatch) return clone(existingBatch.response as { materials: MaterialVariant[]; openingDocument: StockDocument | null });
      const existingDocuments = [...this.stockDocuments.values()].filter((document) =>
        document.tenantId === tenantId && (document.sourceBatchId === input.batchId || document.sourceBatchId?.startsWith(`${input.batchId}:`))
      );
      if (existingDocuments.length) {
        const materialIds = new Set(existingDocuments.flatMap((document) => document.lines.map((line) => line.materialId).filter(Boolean)));
        const result = {
          materials: [...this.materials.values()].filter((material) => material.tenantId === tenantId && materialIds.has(material.id)).map(clone),
          openingDocument: clone(existingDocuments[0])
        };
        await this.saveIdempotency({ tenantId, route: materialImportBatchRoute, key: input.batchId, requestHash: input.batchId, statusCode: 201, response: result });
        return result;
      }
    }
    const preview = await this.previewMaterialImport(tenantId, { materialRows: input.materialRows, openingRows: input.openingRows, rows: input.rows });
    if (preview.errors.length) throw new AppError(422, "VALIDATION_ERROR", "Material import contains invalid rows", preview.errors);
    const snapshot = {
      materials: new Map(this.materials),
      warehouses: new Map(this.warehouses),
      balances: new Map(this.balances),
      inventoryLedger: [...this.inventoryLedger],
      stockDocuments: new Map(this.stockDocuments),
      counters: new Map(this.counters),
      idempotency: new Map(this.idempotency)
    };
    try {
    const materials: MaterialVariant[] = [];
    for (const row of preview.materialRows) {
      const materialCode = row.materialCode ?? derivedMaterialCode(row);
      const existing = [...this.materials.values()].find((candidate) => candidate.tenantId === tenantId && (
        candidate.materialCode === materialCode || materialKey(candidate) === materialKey(row)
      ));
      if (existing) {
        const updated: MaterialVariant = {
          ...existing,
          materialCode,
          materialKey: row.materialKey,
          specKey: row.specKey,
          category: row.category ?? existing.category,
          color: row.color ?? existing.color,
          finish: row.finish ?? existing.finish,
          name: row.name,
          specification: row.specification ?? existing.specification,
          unit: row.unit ?? existing.unit,
          weightKg: row.weightKg === undefined ? existing.weightKg : row.weightKg,
          referenceCostMinor: row.referenceCost === undefined ? existing.referenceCostMinor : Math.round(row.referenceCost * 100),
          note: row.note ?? existing.note,
          source: row.source ?? existing.source,
          active: row.active ?? existing.active,
          revision: existing.revision + 1,
          updatedAt: now()
        };
        this.materials.set(updated.id, updated);
        materials.push(clone(updated));
      } else {
        materials.push(await this.createMaterial(tenantId, {
          materialCode, materialKey: row.materialKey, specKey: row.specKey, category: row.category,
          color: row.color, finish: row.finish, name: row.name, specification: row.specification, unit: row.unit,
          weightKg: row.weightKg, referenceCostMinor: row.referenceCost === undefined ? undefined : Math.round(row.referenceCost * 100),
          note: row.note, source: row.source, active: row.active
        }));
      }
    }
    const byCode = new Map(materials.map((material) => [material.materialCode ?? material.materialKey, material]));
    for (const row of this.materials.values()) {
      if (row.tenantId === tenantId && !byCode.has(row.materialCode)) byCode.set(row.materialCode, row);
    }
    const useRequestedWarehouse = Boolean(input.warehouseId && !input.openingRows?.length);
    const grouped = new Map<string, { warehouseId?: string; warehouseCode?: string; lines: Array<{ materialId: string; materialKey: string; specKey: string; color: string; finish: string; qty: number; note?: string }> }>();
    const addLine = (warehouseId: string | undefined, warehouseCode: string | undefined, material: MaterialVariant, qty: number, note?: string) => {
      if (qty <= 0) return;
      const key = warehouseId ?? `code:${warehouseCode ?? "default"}`;
      const group = grouped.get(key) ?? { warehouseId, warehouseCode, lines: [] };
      group.lines.push({ materialId: material.id, materialKey: material.materialKey, specKey: material.specKey, color: material.color, finish: material.finish, qty, note });
      grouped.set(key, group);
    };
    for (const row of preview.openingRows) {
      const material = byCode.get(row.materialCode);
      if (!material) throw new AppError(422, "VALIDATION_ERROR", `Unknown material code in opening inventory: ${row.materialCode}`);
      addLine(useRequestedWarehouse ? input.warehouseId : undefined, useRequestedWarehouse ? undefined : row.warehouseCode, material, row.openingQty, row.note);
    }
    let openingDocument: StockDocument | null = null;
    const multipleWarehouses = grouped.size > 1;
    for (const group of grouped.values()) {
      let warehouseId = group.warehouseId;
      if (!warehouseId && group.warehouseCode) {
        const existing = this.warehousesForTenant(tenantId).find((warehouse) => warehouse.code === group.warehouseCode);
        warehouseId = (existing ?? await this.createWarehouse(tenantId, { code: group.warehouseCode, name: group.warehouseCode })).id;
      }
      const sourceBatchId = multipleWarehouses
        ? `${input.batchId}:${warehouseId ?? group.warehouseCode ?? "warehouse"}`
        : input.batchId;
      const document = await this.createStockDocument(tenantId, { type: "receive", warehouseId, sourceBatchId, lines: group.lines, note: `material import${input.source ? `: ${input.source}` : ""}` }, actorUserId);
      const posted = await this.postStockDocument(tenantId, document.id, actorUserId);
      openingDocument ??= posted;
    }
    const result = { materials, openingDocument };
    if (input.batchId) {
      await this.saveIdempotency({ tenantId, route: materialImportBatchRoute, key: input.batchId, requestHash: input.batchId, statusCode: 201, response: result });
    }
    return result;
    } catch (error) {
      this.materials = snapshot.materials;
      this.warehouses = snapshot.warehouses;
      this.balances = snapshot.balances;
      this.inventoryLedger = snapshot.inventoryLedger;
      this.stockDocuments = snapshot.stockDocuments;
      this.counters = snapshot.counters;
      this.idempotency = snapshot.idempotency;
      throw error;
    }
  }
  async listDealers(tenantId: string) { return this.values(this.dealers, tenantId); }

  async getDealerForOrganization(organizationId: string) {
    const dealer = [...this.dealers.values()].find((item) => item.organizationId === organizationId);
    return dealer ? clone(dealer) : null;
  }

  async getPricingTenantId(organizationId: string): Promise<string> {
    return (await this.getDealerForOrganization(organizationId))?.tenantId ?? organizationId;
  }

  async getSalesPricingPreference(organizationId: string, userId: string): Promise<SalesPricingPreference | null> {
    const item = this.salesPricingPreferences.get(`${organizationId}:${userId}`);
    return item ? clone(item) : null;
  }

  async setSalesPricingPreference(organizationId: string, userId: string, salesMultiplierBasisPoints: number): Promise<SalesPricingPreference> {
    const stamp = now();
    const item: SalesPricingPreference = {
      salesMultiplierBasisPoints,
      source: "user_default",
      updatedAt: stamp
    };
    this.salesPricingPreferences.set(`${organizationId}:${userId}`, clone(item));
    return clone(item);
  }

  async createDealer(tenantId: string, input: CreateDealerInput): Promise<Dealer> {
    const stamp = now();
    const organizationId = randomUUID();
    const code = input.code || `DLR-CN-${organizationId.slice(0, 8).toUpperCase()}`;
    const item: Dealer = {
      id: randomUUID(), tenantId, organizationId, code,
      name: input.name, region: input.region, contact: input.contact, phone: input.phone, email: input.email ?? null,
      level: input.level ?? "standard",
      settlementRatePercent: input.settlementRatePercent ?? input.discountRate ?? 90,
      discountRate: input.settlementRatePercent ?? input.discountRate ?? 90,
      status: "active", lastActiveAt: null, revision: 1, createdAt: stamp, updatedAt: stamp
    };
    this.dealers.set(item.id, item);
    this.entitlements.set(item.organizationId, DEALER_MODULES.map((module) => ({ module, enabled: true, permissionAllowlist: null })));
    return clone(item);
  }

  async ensureDealerAdmin(organizationId: string, userId: string, input: { name: string; phone: string; email?: string }): Promise<void> {
    if ([...this.accounts.values()].some((account) => account.phone === input.phone && account.userId !== userId)) {
      throw new AppError(409, "IDEMPOTENCY_CONFLICT", "An account with this phone number already exists");
    }
    const stamp = now();
    this.accounts.set(`dealer-admin-${userId}`, {
      id: `dealer-admin-${userId}`, tenantId: organizationId, userId, name: input.name,
      email: input.email ?? null, phone: input.phone, role: "dealer_admin", status: "active",
      lastActiveAt: null, createdAt: stamp, updatedAt: stamp
    });
    this.permissionGrants.set(`${organizationId}:${userId}`, legacyPermissionsForRole("dealer_admin", "dealer").map((permission) => ({ permission, scope: "organization", assignedUserIds: [] })));
    this.passwordChangeRequired.add(userId);
  }

  async updateDealerSettlementRate(tenantId: string, id: string, settlementRatePercent: number): Promise<Dealer> {
    const current = this.required(this.dealers, tenantId, id, "Dealer");
    const updated = { ...current, settlementRatePercent, discountRate: settlementRatePercent, revision: current.revision + 1, updatedAt: now() };
    this.dealers.set(id, updated);
    return clone(updated);
  }

  async listAccounts(tenantId: string) {
    return this.values(this.accounts, tenantId).filter((account) => account.userId !== "user-demo");
  }

  async createOrganizationAdmin(tenantId: string, userId: string, input: CreateOrganizationAdminInput): Promise<AccountSummary> {
    const entitlements = this.entitlements.get(tenantId) ?? [];
    if (!entitlements.some((item) => item.module === "accounts" && item.enabled)) {
      throw new AppError(409, "VALIDATION_ERROR", "The accounts module must be enabled before creating an organization administrator");
    }
    if ([...this.accounts.values()].some((account) => account.phone === input.phone || (input.email && account.email?.toLowerCase() === input.email.toLowerCase()))) {
      throw new AppError(409, "IDEMPOTENCY_CONFLICT", "An account with this phone number or email already exists");
    }
    const organizationType = tenantId === this.tenant.id ? "hq" as const : "dealer" as const;
    const role = organizationType === "hq" ? "headquarters_admin" : "dealer_admin";
    const stamp = now();
    const item: AccountSummary = {
      id: randomUUID(), tenantId, userId, name: input.name, email: input.email ?? null, phone: input.phone,
      role, status: "active", lastActiveAt: null, createdAt: stamp, updatedAt: stamp
    };
    this.accounts.set(item.id, item);
    this.permissionGrants.set(`${tenantId}:${userId}`, legacyPermissionsForRole(role, organizationType).map((permission) => ({
      permission, scope: "organization", assignedUserIds: []
    })));
    this.dataScopes.set(`${tenantId}:${userId}`, []);
    this.passwordChangeRequired.add(userId);
    return clone(item);
  }

  async updateAccountStatus(tenantId: string, id: string, status: AccountStatus): Promise<AccountSummary> {
    const current = this.required(this.accounts, tenantId, id, "Account");
    if (current.status === "active" && status !== "active") await this.ensureActivePermissionAdministratorAfterDisable(tenantId, id);
    const updated = { ...current, status, updatedAt: now() };
    this.accounts.set(id, updated);
    return clone(updated);
  }

  private async ensureActivePermissionAdministratorAfterDisable(tenantId: string, disabledAccountId: string): Promise<void> {
    const entitlements = this.entitlements.get(tenantId) ?? [];
    if (!entitlements.some((item) => item.module === "accounts" && item.enabled)) return;
    const organizationType = tenantId === this.tenant.id ? "hq" : "dealer" as const;
    for (const candidate of this.accounts.values()) {
      if (candidate.id === disabledAccountId || candidate.tenantId !== tenantId || candidate.status !== "active") continue;
      const authorization = calculateAuthorization({
        role: candidate.role,
        organizationType,
        grants: this.permissionGrants.get(`${tenantId}:${candidate.userId}`),
        dataScopes: this.dataScopes.get(`${tenantId}:${candidate.userId}`),
        entitlements
      });
      if (authorization.effectivePermissions.includes("account.manage") && authorization.effectivePermissions.includes("permission.delegate")) return;
    }
    throw new AppError(409, "VALIDATION_ERROR", "At least one active permission administrator is required");
  }

  async listEmployees(tenantId: string): Promise<Employee[]> {
    return this.values(this.accounts, tenantId)
      .filter((account): account is Employee => account.role === "factory_employee");
  }

  async createEmployee(tenantId: string, userId: string, input: CreateEmployeeInput): Promise<Employee> {
    if ([...this.accounts.values()].some((account) => account.phone === input.phone || (input.email && account.email?.toLocaleLowerCase() === input.email.toLocaleLowerCase()))) {
      throw new AppError(409, "IDEMPOTENCY_CONFLICT", "An account with this phone number or email already exists");
    }
    const stamp = now();
    const item: Employee = {
      id: randomUUID(), tenantId, userId, name: input.name, email: input.email ?? null, phone: input.phone,
      role: "factory_employee", status: "active", lastActiveAt: null, createdAt: stamp, updatedAt: stamp
    };
    this.accounts.set(item.id, item);
    // New enterprise accounts start with an explicit deny-all authorization.
    // Administrators grant the required capabilities after account creation.
    this.permissionGrants.set(`${tenantId}:${userId}`, []);
    this.dataScopes.set(`${tenantId}:${userId}`, []);
    this.passwordChangeRequired.add(userId);
    return clone(item);
  }

  async updateEmployeeStatus(tenantId: string, id: string, status: AccountStatus): Promise<Employee> {
    const account = await this.updateAccountStatus(tenantId, id, status);
    if (account.role !== "factory_employee") throw new AppError(404, "NOT_FOUND", "Employee not found");
    return { ...account, role: "factory_employee" };
  }

  async listEmployeeOrderSummaries(tenantId: string, employeeUserId?: string): Promise<EmployeeOrderSummary[]> {
    const employees = await this.listEmployees(tenantId);
    const scope = employeeUserId ? employees.filter((employee) => employee.userId === employeeUserId) : employees;
    const statusValues: OrderStatus[] = ["draft", "confirmed", "technical_review", "ready_for_production", "in_production", "ready_to_ship", "shipped", "delivered", "completed", "on_hold", "cancelled"];
    const stamp = now();
    return scope.map((employee) => {
      const employeeOrders = this.values(this.orders, tenantId).filter((order) => order.ownerUserId === employee.userId);
      const followUps = this.values(this.orderFollowUps, tenantId).filter((item) => item.authorUserId === employee.userId);
      const nextFollowUps = followUps.filter((item) => item.nextFollowUpAt && item.nextFollowUpAt <= stamp);
      const latest = followUps.map((item) => item.createdAt).sort().at(-1) ?? null;
      return {
        employee,
        totalOrders: employeeOrders.length,
        totalAmountMinor: employeeOrders.filter((order) => order.status !== "cancelled").reduce((sum, order) => sum + order.totalMinor, 0),
        statusCounts: Object.fromEntries(statusValues.map((status) => [status, employeeOrders.filter((order) => order.status === status).length])) as EmployeeOrderSummary["statusCounts"],
        pendingFollowUpCount: nextFollowUps.length,
        latestFollowUpAt: latest
      };
    });
  }

  async listEmployeeFollowUpSummaries(tenantId: string, employeeUserId?: string): Promise<EmployeeFollowUpSummary[]> {
    const employees = await this.listEmployees(tenantId);
    const scope = employeeUserId ? employees.filter((employee) => employee.userId === employeeUserId) : employees;
    const stamp = now();
    const today = stamp.slice(0, 10);
    return scope.map((employee) => {
      const followUps = this.values(this.orderFollowUps, tenantId).filter((item) => item.authorUserId === employee.userId);
      const scheduled = followUps.filter((item) => item.nextFollowUpAt);
      return {
        employee,
        totalFollowUps: followUps.length,
        followedOrderCount: new Set(followUps.map((item) => item.orderId)).size,
        pendingNextFollowUpCount: followUps.filter((item) => item.nextFollowUpAt && item.nextFollowUpAt <= stamp).length,
        dueTodayCount: scheduled.filter((item) => item.nextFollowUpAt!.slice(0, 10) === today).length,
        overdueCount: scheduled.filter((item) => item.nextFollowUpAt!.slice(0, 10) < today).length,
        latestFollowUpAt: followUps.map((item) => item.createdAt).sort().at(-1) ?? null
      };
    });
  }

  async listPriceLists(tenantId: string) { return this.values(this.priceLists, tenantId); }
  async getPriceList(tenantId: string, id: string) { return this.get(this.priceLists, tenantId, id); }

  async createPriceList(tenantId: string, input: CreatePriceListInput): Promise<PriceList> {
    const stamp = now();
    const item: PriceList = {
      id: randomUUID(), tenantId, code: input.code, name: input.name, market: input.market,
      currency: input.currency ?? "CNY", version: input.version, itemCount: 0,
      effectiveFrom: input.effectiveFrom, effectiveTo: null, status: "draft",
      publishedBy: null, publishedAt: null, revision: 1, createdAt: stamp, updatedAt: stamp
    };
    this.priceLists.set(item.id, item);
    return clone(item);
  }

  async listPriceListItems(tenantId: string, priceListId: string): Promise<PriceListItem[]> {
    this.required(this.priceLists, tenantId, priceListId, "Price list");
    return this.values(this.priceListItems, tenantId).filter((item) => item.priceListId === priceListId);
  }

  async savePriceListItems(tenantId: string, priceListId: string, inputs: SavePriceListItemInput[]): Promise<PriceListItem[]> {
    const list = this.required(this.priceLists, tenantId, priceListId, "Price list");
    if (list.status !== "draft") throw new AppError(409, "INVALID_TRANSITION", "Only draft price lists can be edited");
    assertUniqueInputKeys(inputs);
    const existing = await this.listPriceListItems(tenantId, priceListId);
    const byKey = new Map(existing.map((item) => [`${item.materialKey}\u0000${item.specKey}`, item]));
    const stamp = now();
    for (const input of inputs) {
      const key = `${input.materialKey}\u0000${input.specKey}`;
      const current = byKey.get(key);
      const item: PriceListItem = {
        id: current?.id ?? input.id ?? randomUUID(), tenantId, priceListId,
        materialKey: input.materialKey, specKey: input.specKey, category: input.category,
        name: input.name, specification: input.specification ?? "", unit: input.unit,
        pricingMethod: input.pricingMethod ?? "fixed",
        retailUnitPriceMinor: input.retailUnitPriceMinor ?? input.retailPriceMinor ?? null,
        pricingRule: input.pricingRule ?? input.rule ?? null,
        note: input.note ?? input.remark ?? "", sourceRef: input.sourceRef ?? input.materialCode ?? null,
        revision: (current?.revision ?? 0) + 1, createdAt: current?.createdAt ?? stamp, updatedAt: stamp
      };
      this.priceListItems.set(item.id, item);
      byKey.set(key, item);
    }
    const items = await this.listPriceListItems(tenantId, priceListId);
    this.priceLists.set(priceListId, { ...list, itemCount: items.length, revision: list.revision + 1, updatedAt: stamp });
    return items;
  }

  async validatePriceList(tenantId: string, priceListId: string): Promise<PriceListValidation> {
    return validateItems(await this.listPriceListItems(tenantId, priceListId));
  }

  async publishPriceList(tenantId: string, priceListId: string, userId: string, effectiveFrom?: string): Promise<PriceList> {
    const current = this.required(this.priceLists, tenantId, priceListId, "Price list");
    if (current.status !== "draft") throw new AppError(409, "INVALID_TRANSITION", "Only draft price lists can be published");
    const validation = await this.validatePriceList(tenantId, priceListId);
    if (!validation.valid) throw new AppError(409, "VALIDATION_ERROR", "Price list validation failed", validation);
    const starts = effectiveFrom ?? current.effectiveFrom;
    const previousDay = new Date(`${starts}T00:00:00.000Z`);
    previousDay.setUTCDate(previousDay.getUTCDate() - 1);
    for (const [id, list] of this.priceLists) {
      if (id === priceListId || list.tenantId !== tenantId || list.market !== current.market || list.currency !== current.currency || list.status !== "active") continue;
      const effectiveTo = previousDay.toISOString().slice(0, 10);
      const status = effectiveTo < new Date().toISOString().slice(0, 10) ? "expired" as const : list.status;
      this.priceLists.set(id, { ...list, status, effectiveTo, revision: list.revision + 1, updatedAt: now() });
    }
    const stamp = now();
    const published = { ...current, effectiveFrom: starts, effectiveTo: null, status: "active" as const, publishedBy: userId, publishedAt: stamp, revision: current.revision + 1, updatedAt: stamp };
    this.priceLists.set(priceListId, published);
    return clone(published);
  }

  async clonePriceList(tenantId: string, priceListId: string, input: ClonePriceListInput): Promise<PriceList> {
    const source = this.required(this.priceLists, tenantId, priceListId, "Price list");
    const cloned = await this.createPriceList(tenantId, {
      name: input.name ?? `${source.name} copy`, code: input.code ?? source.code,
      market: source.market, currency: source.currency,
      version: input.version ?? `${source.version}-copy-${Date.now()}`, effectiveFrom: input.effectiveFrom ?? source.effectiveFrom
    });
    const items = await this.listPriceListItems(tenantId, priceListId);
    await this.savePriceListItems(tenantId, cloned.id, items.map((item) => ({
      materialKey: item.materialKey, specKey: item.specKey, category: item.category, name: item.name,
      specification: item.specification, unit: item.unit, pricingMethod: item.pricingMethod,
      retailUnitPriceMinor: item.retailUnitPriceMinor, pricingRule: item.pricingRule,
      note: item.note, sourceRef: item.sourceRef
    })));
    return this.required(this.priceLists, tenantId, cloned.id, "Price list");
  }

  async getActivePriceList(tenantId: string, market: string, currency: string, at = new Date()): Promise<PriceList | null> {
    const date = at.toISOString().slice(0, 10);
    return this.values(this.priceLists, tenantId).find((item) => item.status === "active" && item.market === market && item.currency === currency && item.effectiveFrom <= date && (!item.effectiveTo || item.effectiveTo >= date)) ?? null;
  }

  async getPublicPricingTenantId(market: string, currency: string, at = new Date()): Promise<string | null> {
    const date = at.toISOString().slice(0, 10);
    return [...this.priceLists.values()].find((item) => item.status === "active" && item.market === market && item.currency === currency && item.effectiveFrom <= date && (!item.effectiveTo || item.effectiveTo >= date))?.tenantId ?? null;
  }
  async listCustomers(tenantId: string) { return this.values(this.customers, tenantId); }
  async getCustomer(tenantId: string, id: string) { return this.get(this.customers, tenantId, id); }

  async createCustomer(tenantId: string, userId: string, input: CreateCustomerInput): Promise<Customer> {
    const stamp = now();
    const item: Customer = {
      id: randomUUID(), tenantId, createdByUserId: userId, code: this.code("CUS"), name: input.name,
      companyName: input.companyName ?? null, email: input.email ?? null,
      phone: input.phone ?? null, address: input.address ?? null, status: "active",
      revision: 1, createdAt: stamp, updatedAt: stamp
    };
    this.customers.set(item.id, item);
    return clone(item);
  }

  async updateCustomer(tenantId: string, id: string, revision: number, input: Partial<Customer>): Promise<Customer> {
    const current = this.required(this.customers, tenantId, id, "Customer");
    ensureRevision(current.revision, revision);
    const updated = { ...current, ...clone(input), id, tenantId, code: current.code, revision: revision + 1, updatedAt: now() };
    this.customers.set(id, updated);
    return clone(updated);
  }

  async listProjects(tenantId: string, customerId?: string) {
    return this.values(this.projects, tenantId).filter((item) => !customerId || item.customerId === customerId);
  }
  async getProject(tenantId: string, id: string) { return this.get(this.projects, tenantId, id); }

  async createProject(tenantId: string, userId: string, input: CreateProjectInput): Promise<Project> {
    if (input.customerId) this.required(this.customers, tenantId, input.customerId, "Customer");
    const stamp = now();
    const item: Project = {
      id: randomUUID(), tenantId, createdByUserId: userId, code: this.code("PRJ"), customerId: input.customerId ?? null,
      name: input.name, status: "lead", ownerUserId: userId,
      description: input.description ?? null, targetDate: input.targetDate ?? null,
      revision: 1, createdAt: stamp, updatedAt: stamp
    };
    this.projects.set(item.id, item);
    return clone(item);
  }

  async updateProject(tenantId: string, id: string, revision: number, input: Partial<Project>): Promise<Project> {
    const current = this.required(this.projects, tenantId, id, "Project");
    ensureRevision(current.revision, revision);
    if (input.customerId) this.required(this.customers, tenantId, input.customerId, "Customer");
    const updated = { ...current, ...clone(input), id, tenantId, code: current.code, revision: revision + 1, updatedAt: now() };
    this.projects.set(id, updated);
    return clone(updated);
  }

  async listDesigns(tenantId: string, projectId?: string) {
    return this.values(this.designs, tenantId).filter((item) => !projectId || item.projectId === projectId);
  }
  async getDesign(tenantId: string, id: string) { return this.get(this.designs, tenantId, id); }

  async createDesign(tenantId: string, userId: string, input: CreateDesignInput): Promise<Design> {
    this.required(this.projects, tenantId, input.projectId, "Project");
    const calculated = recalculateDesignSnapshot(input.configSnapshot);
    const stamp = now();
    const item: Design = {
      id: randomUUID(), tenantId, createdByUserId: userId, code: this.code("DSN"), projectId: input.projectId,
      name: input.name, templateVersionId: input.templateVersionId ?? null, status: "draft",
      draftRevision: 1, ...calculated, revision: 1, createdAt: stamp, updatedAt: stamp
    };
    this.designs.set(item.id, item);
    return clone(item);
  }

  async updateDesignDraft(
    tenantId: string,
    id: string,
    draftRevision: number,
    input: Pick<Design, "configSnapshot" | "bomSnapshot" | "pricingSnapshot"> & { name?: string }
  ): Promise<Design> {
    const current = this.required(this.designs, tenantId, id, "Design");
    ensureRevision(current.draftRevision, draftRevision);
    const calculated = recalculateDesignSnapshot(input.configSnapshot);
    const updated: Design = {
      ...current, ...calculated, name: input.name ?? current.name,
      draftRevision: draftRevision + 1, revision: current.revision + 1, updatedAt: now()
    };
    this.designs.set(id, updated);
    return clone(updated);
  }

  async createDesignVersion(tenantId: string, designId: string, userId: string, note?: string): Promise<DesignVersion> {
    const design = this.required(this.designs, tenantId, designId, "Design");
    const versionNumber = [...this.designVersions.values()].filter((item) => item.tenantId === tenantId && item.designId === designId).length + 1;
    const version = snapshotDesignDraft(design, {
      id: randomUUID(), version: versionNumber, createdBy: userId, createdAt: now(), note
    });
    this.designVersions.set(version.id, version);
    return clone(version);
  }
  async getDesignVersion(tenantId: string, id: string) { return this.get(this.designVersions, tenantId, id); }

  async listQuotes(tenantId: string, projectId?: string) {
    return this.values(this.quotes, tenantId).filter((item) => !projectId || item.projectId === projectId);
  }
  async getQuote(tenantId: string, id: string) { return this.get(this.quotes, tenantId, id); }

  async createQuote(tenantId: string, input: Omit<Quote, "id" | "tenantId" | "code" | "revision" | "createdAt" | "updatedAt">): Promise<Quote> {
    this.required(this.projects, tenantId, input.projectId, "Project");
    this.required(this.designVersions, tenantId, input.designVersionId, "Design version");
    const stamp = now();
    const item: Quote = { ...clone(input), id: randomUUID(), tenantId, code: this.code("QUO"), revision: 1, createdAt: stamp, updatedAt: stamp };
    this.quotes.set(item.id, item);
    return clone(item);
  }

  async updateQuote(tenantId: string, id: string, revision: number, input: Partial<Quote>): Promise<Quote> {
    const current = this.required(this.quotes, tenantId, id, "Quote");
    ensureRevision(current.revision, revision);
    const updated = { ...current, ...clone(input), id, tenantId, code: current.code, revision: revision + 1, updatedAt: now() };
    this.quotes.set(id, updated);
    return clone(updated);
  }

  async transitionQuote(tenantId: string, id: string, revision: number, status: QuoteStatus): Promise<Quote> {
    return this.updateQuote(tenantId, id, revision, { status });
  }

  async listOrders(tenantId: string, projectId?: string, ownerUserId?: string) {
    return this.values(this.orders, tenantId).filter((item) =>
      (!projectId || item.projectId === projectId) && (!ownerUserId || item.ownerUserId === ownerUserId)
    );
  }
  async getOrder(tenantId: string, id: string, ownerUserId?: string) {
    const item = await this.get(this.orders, tenantId, id);
    return item && (!ownerUserId || item.ownerUserId === ownerUserId) ? item : null;
  }

  async createOrder(tenantId: string, input: Omit<Order, "id" | "tenantId" | "code" | "revision" | "createdAt" | "updatedAt">): Promise<Order> {
    this.required(this.quotes, tenantId, input.acceptedQuoteId, "Quote");
    const stamp = now();
    const item: Order = { ...clone(input), id: randomUUID(), tenantId, code: this.code("ORD"), revision: 1, createdAt: stamp, updatedAt: stamp };
    this.orders.set(item.id, item);
    return clone(item);
  }

  async createOrderFromQuote(
    tenantId: string,
    quoteRevision: number,
    input: Omit<Order, "id" | "tenantId" | "code" | "revision" | "createdAt" | "updatedAt">
  ): Promise<{ order: Order; quote: Quote }> {
    const quote = this.required(this.quotes, tenantId, input.acceptedQuoteId, "Quote");
    ensureRevision(quote.revision, quoteRevision);
    if ([...this.orders.values()].some((item) => item.tenantId === tenantId && item.acceptedQuoteId === quote.id)) {
      throw new AppError(409, "IDEMPOTENCY_CONFLICT", "An order already exists for this quote");
    }
    const stamp = now();
    const order: Order = {
      ...clone(input), id: randomUUID(), tenantId, code: this.code("ORD"),
      revision: 1, createdAt: stamp, updatedAt: stamp
    };
    const convertedQuote: Quote = {
      ...quote, status: "converted", revision: quote.revision + 1, updatedAt: stamp
    };
    this.orders.set(order.id, order);
    this.quotes.set(quote.id, convertedQuote);
    return { order: clone(order), quote: clone(convertedQuote) };
  }

  async transitionOrder(tenantId: string, id: string, revision: number, status: OrderStatus, shippingNote?: string, actorUserId?: string): Promise<Order> {
    const current = this.required(this.orders, tenantId, id, "Order");
    ensureRevision(current.revision, revision);
    if (status === "cancelled") {
      await this.releaseInventoryReservation(tenantId, id, actorUserId ?? "system");
    }
    const updated: Order = {
      ...current, status, shippingNote: shippingNote ?? current.shippingNote,
      revision: revision + 1, updatedAt: now()
    };
    this.orders.set(id, updated);
    return clone(updated);
  }

  async updateOrderDeliverySchedule(
    tenantId: string,
    id: string,
    revision: number,
    input: { deliveryLeadTimeDays: number; customerConfirmedAt: string; expectedDeliveryDate: string }
  ): Promise<Order> {
    const current = this.required(this.orders, tenantId, id, "Order");
    ensureRevision(current.revision, revision);
    const updated: Order = {
      ...current,
      customerConfirmedAt: input.customerConfirmedAt,
      deliveryLeadTimeDays: input.deliveryLeadTimeDays,
      expectedDeliveryDate: input.expectedDeliveryDate,
      revision: revision + 1,
      updatedAt: now()
    };
    this.orders.set(id, updated);
    return clone(updated);
  }

  async assignOrder(tenantId: string, id: string, input: AssignOrderInput, assignedByUserId: string): Promise<{ order: Order; assignment: OrderAssignment }> {
    const current = this.required(this.orders, tenantId, id, "Order");
    if (input.ownerUserId) {
      const account = [...this.accounts.values()].find((candidate) =>
        candidate.tenantId === tenantId && candidate.userId === input.ownerUserId && candidate.status === "active"
      );
      if (!account) throw new AppError(422, "VALIDATION_ERROR", "The assignee must be an active account in this organization");
    }
    const stamp = now();
    const order: Order = {
      ...current,
      ownerUserId: input.ownerUserId,
      assignedAt: input.ownerUserId ? stamp : null,
      assignedByUserId,
      revision: current.revision + 1,
      updatedAt: stamp
    };
    const assignment: OrderAssignment = {
      id: randomUUID(), tenantId, orderId: id, previousOwnerUserId: current.ownerUserId,
      ownerUserId: input.ownerUserId, assignedByUserId, createdAt: stamp
    };
    this.orders.set(id, order);
    this.orderAssignments.set(assignment.id, assignment);
    return { order: clone(order), assignment: clone(assignment) };
  }

  async listOrderFollowUps(tenantId: string, orderId: string): Promise<OrderFollowUp[]> {
    this.required(this.orders, tenantId, orderId, "Order");
    return this.values(this.orderFollowUps, tenantId).filter((item) => item.orderId === orderId);
  }

  async createOrderFollowUp(tenantId: string, orderId: string, authorUserId: string, input: CreateOrderFollowUpInput): Promise<OrderFollowUp> {
    this.required(this.orders, tenantId, orderId, "Order");
    const stamp = now();
    const item: OrderFollowUp = {
      id: randomUUID(), tenantId, orderId, authorUserId, content: input.content,
      nextFollowUpAt: input.nextFollowUpAt ?? null, createdAt: stamp, updatedAt: stamp
    };
    this.orderFollowUps.set(item.id, item);
    return clone(item);
  }

  async listShipments(tenantId: string, orderId?: string) {
    return this.values(this.shipments, tenantId).filter((item) => !orderId || item.orderId === orderId);
  }

  async createShipment(tenantId: string, input: CreateShipmentInput): Promise<{ shipment: Shipment; order: Order }> {
    const current = this.required(this.orders, tenantId, input.orderId, "Order");
    if (!["ready_to_ship", "shipped", "delivered", "completed"].includes(current.status)) {
      throw new AppError(409, "INVALID_TRANSITION", "The order is not ready to ship");
    }
    const stamp = now();
    const shipment: Shipment = {
      id: randomUUID(), tenantId, orderId: input.orderId, shipmentNo: this.code("SHP"),
      carrier: input.carrier, trackingNo: input.trackingNo, status: "shipped", packages: input.packages,
      shippedAt: input.shippedAt ?? stamp, signedAt: null, revision: 1, createdAt: stamp, updatedAt: stamp
    };
    const order: Order = current.status === "ready_to_ship"
      ? { ...current, status: "shipped", revision: current.revision + 1, updatedAt: stamp }
      : current;
    this.shipments.set(shipment.id, shipment);
    if (order !== current) this.orders.set(order.id, order);
    return { shipment: clone(shipment), order: clone(order) };
  }

  async listAttachments(tenantId: string, entityType?: string, entityId?: string) {
    return this.values(this.attachments, tenantId).filter((item) =>
      (!entityType || item.entityType === entityType) && (!entityId || item.entityId === entityId)
    );
  }

  async createAttachment(tenantId: string, userId: string, input: CreateAttachmentInput): Promise<Attachment> {
    const stamp = now();
    const id = randomUUID();
    const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const item: Attachment = {
      id, tenantId, entityType: input.entityType, entityId: input.entityId,
      fileName: input.fileName, contentType: input.contentType, sizeBytes: input.sizeBytes,
      objectKey: `${tenantId}/${input.entityType}/${input.entityId}/${id}-${safeName}`,
      uploadPending: true, createdBy: userId, metadata: clone(input.metadata ?? {}),
      revision: 1, createdAt: stamp, updatedAt: stamp
    };
    this.attachments.set(id, item);
    return clone(item);
  }

  async recordAudit(input: AuditInput): Promise<AuditLog> {
    const item: AuditLog = {
      id: randomUUID(), tenantId: input.tenantId, actorUserId: input.actorUserId,
      action: input.action, entityType: input.entityType, entityId: input.entityId,
      requestId: input.requestId, before: clone(input.before ?? null), after: clone(input.after ?? null),
      metadata: clone(input.metadata ?? {}), createdAt: now()
    };
    this.audit.unshift(item);
    return clone(item);
  }

  async listAudit(tenantId: string, entityType?: string, entityId?: string): Promise<AuditLog[]> {
    return clone(this.audit.filter((item) => item.tenantId === tenantId && (!entityType || item.entityType === entityType) && (!entityId || item.entityId === entityId)));
  }

  async recordLoginLog(input: LoginLogInput): Promise<void> {
    const account = [...this.accounts.values()].find((item) => item.userId === input.userId);
    this.loginLogs.unshift({
      id: randomUUID(), userId: input.userId, userName: account?.name ?? input.userId,
      accountIdentifier: input.accountIdentifier ?? account?.email ?? account?.phone ?? null,
      tenantId: input.tenantId, tenantName: input.tenantId ? this.tenant.name : null,
      ipAddress: input.ipAddress ?? null, userAgent: input.userAgent ?? null, createdAt: now()
    });
  }

  async listLoginLogs(query: LoginLogQuery): Promise<{ items: LoginLogSummary[]; total: number }> {
    const normalized = query.search?.trim().toLocaleLowerCase() ?? "";
    const filtered = this.loginLogs.filter((item) => {
      if (query.tenantId && item.tenantId !== query.tenantId) return false;
      const date = item.createdAt.slice(0, 10);
      if (query.start && date < query.start) return false;
      if (query.end && date > query.end) return false;
      if (normalized && !`${item.userName}${item.accountIdentifier ?? ""}${item.ipAddress ?? ""}`.toLocaleLowerCase().includes(normalized)) return false;
      return true;
    });
    const start = (query.page - 1) * query.pageSize;
    return { items: clone(filtered.slice(start, start + query.pageSize)), total: filtered.length };
  }

  async getIdempotency(tenantId: string, route: string, key: string) {
    return clone(this.idempotency.get(`${tenantId}:${route}:${key}`) ?? null);
  }
  async saveIdempotency(record: IdempotencyRecord): Promise<void> {
    this.idempotency.set(`${record.tenantId}:${record.route}:${record.key}`, clone(record));
  }
  async close(): Promise<void> {}

  private seedOperationalData(
    stamp: string,
    calculated: ReturnType<typeof recalculateDesignSnapshot>,
    templateVersionId: string
  ): void {
    const customer: Customer = {
      id: "customer-demo", tenantId: this.tenant.id, createdByUserId: "user-demo", code: "CUS-00001", name: "林女士",
      companyName: "示例住宅项目", email: "customer@example.com", phone: "13800000000",
      address: "上海市", status: "active", revision: 1, createdAt: stamp, updatedAt: stamp
    };
    this.customers.set(customer.id, customer);

    const project: Project = {
      id: "project-demo", tenantId: this.tenant.id, createdByUserId: "user-demo", code: "PRJ-00001", customerId: customer.id,
      name: "静安客厅组合柜", status: "won", ownerUserId: "user-demo", description: "开发验收种子项目",
      targetDate: null, revision: 1, createdAt: stamp, updatedAt: stamp
    };
    this.projects.set(project.id, project);

    const design: Design = {
      id: "design-demo", tenantId: this.tenant.id, createdByUserId: "user-demo", code: "DSN-00001", projectId: project.id,
      name: "客厅组合柜 A", templateVersionId, status: "approved", draftRevision: 1,
      ...clone(calculated), revision: 1, createdAt: stamp, updatedAt: stamp
    };
    this.designs.set(design.id, design);
    const designVersion = snapshotDesignDraft(design, {
      id: "design-version-demo", version: 1, createdBy: "user-demo", createdAt: stamp, note: "开发种子版本"
    });
    this.designVersions.set(designVersion.id, designVersion);

    const lines = calculated.bomSnapshot.map((line, index) => {
      const quantity = Math.max(0, Number(line.qty ?? 0));
      const unitPriceMinor = Math.max(0, Math.round(Number(line.unitPrice ?? 0) * 100));
      return {
        id: `quote-line-demo-${index + 1}`,
        sourceRef: String(line.materialCode ?? `${line.name ?? "item"}:${line.spec ?? index}`),
        description: [line.name, line.spec, line.color].filter(Boolean).join(" / "),
        quantity,
        unitPriceMinor,
        lineTotalMinor: Math.round(quantity * unitPriceMinor),
        pricingStatus: line.priceStatus === "sourceIncluded" ? "included" as const : line.priceStatus === "fallback" ? "unmatched" as const : "priced" as const,
        metadata: { sourceStatus: line.priceStatus ?? "unknown", unit: line.unit ?? "件" }
      };
    });
    const subtotalMinor = lines.reduce((sum, line) => sum + line.lineTotalMinor, 0);
    const quote: Quote = {
      id: "quote-demo", tenantId: this.tenant.id, createdByUserId: "user-demo", code: "QUO-00001", projectId: project.id,
      customerId: customer.id, designVersionId: designVersion.id, status: "customer_confirmed", currency: "CNY",
      subtotalMinor, discountMinor: 0, taxMinor: 0, totalMinor: subtotalMinor,
      basePriceTotalMinor: null, salesMultiplierBasisPoints: null, multiplierQuoteTotalMinor: null,
      validUntil: null, notes: "开发验收种子报价", lines,
      snapshot: { schemaVersion: 1, designVersion, calculation: { lines, subtotalMinor, totalMinor: subtotalMinor }, quoteTerms: { taxRateBasisPoints: 0, pricingAuthority: "server" } },
      revision: 1, createdAt: stamp, updatedAt: stamp
    };
    this.quotes.set(quote.id, quote);

    const order: Order = {
      id: "order-demo", tenantId: this.tenant.id, createdByUserId: "user-demo", code: "ORD-00001", projectId: project.id,
      customerId: customer.id, acceptedQuoteId: quote.id, status: "confirmed", currency: "CNY",
      totalMinor: quote.totalMinor, snapshot: { schemaVersion: 1, acceptedAt: stamp, quote },
      customerConfirmedAt: quote.updatedAt,
      deliveryLeadTimeDays: 30,
      expectedDeliveryDate: null,
      productionNote: "开发验收种子订单", shippingNote: null,
      ownerUserId: null, assignedAt: null, assignedByUserId: null,
      revision: 1, createdAt: stamp, updatedAt: stamp
    };
    this.orders.set(order.id, order);

    const dealer: Dealer = {
      id: "dealer-demo", tenantId: this.tenant.id, organizationId: "dealer-organization-demo",
      code: "DLR-CN-001", name: "华东示例经销商", region: "华东", contact: "陈经理",
      phone: null, email: "dealer@example.com", level: "core", settlementRatePercent: 85, discountRate: 85, status: "active",
      lastActiveAt: stamp, revision: 1, createdAt: stamp, updatedAt: stamp
    };
    this.dealers.set(dealer.id, dealer);
    this.accounts.set("membership-demo", {
      id: "membership-demo", tenantId: this.tenant.id, userId: "user-demo", name: "开发用户",
      email: "developer@local.test", phone: null, role: "owner", status: "active", lastActiveAt: stamp,
      createdAt: stamp, updatedAt: stamp
    });
    this.permissionGrants.set(`${this.tenant.id}:user-demo`, legacyPermissionsForRole("owner", "hq").map((permission) => ({
      permission, scope: "organization", assignedUserIds: []
    })));
    this.priceLists.set("price-list-demo", {
      id: "price-list-demo", tenantId: this.tenant.id, code: "CN-RRP", name: "中国大陆建议零售价",
      market: "中国大陆", currency: "CNY", version: "2026.1", itemCount: 0,
      effectiveFrom: stamp.slice(0, 10), effectiveTo: null, status: "active",
      publishedBy: "user-demo", publishedAt: stamp, revision: 1, createdAt: stamp, updatedAt: stamp
    });
    for (const [index, source] of buildLegacyPriceCatalog().entries()) {
      const item: PriceListItem = {
        id: `price-item-demo-${index + 1}`, tenantId: this.tenant.id, priceListId: "price-list-demo",
        ...source, revision: 1, createdAt: stamp, updatedAt: stamp
      };
      this.priceListItems.set(item.id, item);
    }
    const activePriceList = this.priceLists.get("price-list-demo")!;
    this.priceLists.set("price-list-demo", { ...activePriceList, itemCount: this.priceListItems.size });

    this.counters.set("CUS", 1);
    this.counters.set("PRJ", 1);
    this.counters.set("DSN", 1);
    this.counters.set("QUO", 1);
    this.counters.set("ORD", 1);
    this.counters.set("SHP", 0);
    this.warehouses.set("warehouse-main", {
      id: "warehouse-main", tenantId: this.tenant.id, code: "MAIN", name: "Main warehouse", isDefault: true,
      revision: 1, createdAt: stamp, updatedAt: stamp
    });
  }

  private warehousesForTenant(tenantId: string): Warehouse[] {
    return [...this.warehouses.values()].filter((item) => item.tenantId === tenantId);
  }

  private async ensureWarehouse(tenantId: string, id?: string): Promise<Warehouse> {
    const current = id ? this.warehouses.get(id) : this.warehousesForTenant(tenantId).find((item) => item.isDefault) ?? this.warehousesForTenant(tenantId)[0];
    if (current && current.tenantId === tenantId) return current;
    if (id) throw new AppError(404, "NOT_FOUND", "Warehouse not found");
    return this.createWarehouse(tenantId, { code: "MAIN", name: "Main warehouse", isDefault: true });
  }

  private balanceFor(tenantId: string, warehouseId: string, materialId: string): InventoryBalance {
    const material = this.required(this.materials, tenantId, materialId, "Material");
    const key = `${tenantId}:${warehouseId}:${materialId}`;
    const current = this.balances.get(key);
    if (current) return current;
    const stamp = now();
    const item: InventoryBalance = { id: randomUUID(), tenantId, warehouseId, materialId, materialKey: material.materialKey, specKey: material.specKey, color: material.color, finish: material.finish, onHandQty: 0, reservedQty: 0, availableQty: 0, revision: 1, createdAt: stamp, updatedAt: stamp };
    this.balances.set(key, item);
    return item;
  }

  private applyBalance(tenantId: string, warehouseId: string, materialId: string, delta: number): void {
    const item = this.balanceFor(tenantId, warehouseId, materialId);
    const onHandQty = item.onHandQty + delta;
    if (onHandQty < 0 || onHandQty < item.reservedQty) throw new AppError(409, "VALIDATION_ERROR", "Inventory on-hand quantity cannot be negative or below reserved quantity");
    const updated = { ...item, onHandQty, availableQty: onHandQty - item.reservedQty, revision: item.revision + 1, updatedAt: now() };
    this.balances.set(`${tenantId}:${warehouseId}:${materialId}`, updated);
  }

  private applyReserved(tenantId: string, warehouseId: string, materialId: string, delta: number): void {
    const item = this.balanceFor(tenantId, warehouseId, materialId);
    const reservedQty = item.reservedQty + delta;
    if (reservedQty < 0 || reservedQty > item.onHandQty) throw new AppError(409, "VALIDATION_ERROR", "Reserved quantity is invalid");
    const updated = { ...item, reservedQty, availableQty: item.onHandQty - reservedQty, revision: item.revision + 1, updatedAt: now() };
    this.balances.set(`${tenantId}:${warehouseId}:${materialId}`, updated);
  }

  private appendLedger(tenantId: string, warehouseId: string, materialId: string, direction: InventoryLedger["direction"], quantity: number, deltaQty: number, referenceId: string | null, actorUserId: string | null, note: string | null): void {
    const stamp = now();
    this.inventoryLedger.unshift({ id: randomUUID(), tenantId, warehouseId, materialId, direction, quantity, deltaQty, referenceType: "stock_document", referenceId, note, actorUserId, revision: 1, createdAt: stamp, updatedAt: stamp });
  }

  private code(prefix: string): string {
    const next = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, next);
    return `${prefix}-${String(next).padStart(5, "0")}`;
  }

  private values<T extends { tenantId: string; updatedAt?: string; createdAt: string }>(map: Map<string, T>, tenantId: string): T[] {
    return [...map.values()]
      .filter((item) => item.tenantId === tenantId)
      .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))
      .map(clone);
  }

  private get<T extends { tenantId: string }>(map: Map<string, T>, tenantId: string, id: string): T | null {
    const item = map.get(id);
    return item?.tenantId === tenantId ? clone(item) : null;
  }

  private required<T extends { tenantId: string }>(map: Map<string, T>, tenantId: string, id: string, label: string): T {
    const item = map.get(id);
    if (!item || item.tenantId !== tenantId) throw new AppError(404, "NOT_FOUND", `${label} not found`);
    return item;
  }
}

function validateItems(items: PriceListItem[]): PriceListValidation {
  const errors: PriceListValidation["errors"] = [];
  const keys = new Set<string>();
  for (const item of items) {
    const key = `${item.materialKey}\u0000${item.specKey}`;
    if (keys.has(key)) errors.push({ code: "DUPLICATE_KEY", message: `Duplicate material/spec key: ${item.materialKey} / ${item.specKey}`, itemId: item.id });
    keys.add(key);
    if (item.pricingMethod === "fixed" && item.retailUnitPriceMinor === null) errors.push({ code: "MISSING_PRICE", message: `Missing price: ${item.name}`, itemId: item.id });
    if (["formula", "area", "length", "composite"].includes(item.pricingMethod) && !isSupportedPricingRule(item)) errors.push({ code: "MISSING_RULE", message: `Missing or unsupported pricing rule: ${item.name}`, itemId: item.id });
  }
  if (!items.length) errors.push({ code: "EMPTY_PRICE_LIST", message: "The price list has no items", itemId: null });
  const priced = items.filter((item) => item.pricingMethod === "included" || item.retailUnitPriceMinor !== null || item.pricingRule !== null).length;
  const formula = items.filter((item) => ["formula", "area", "length", "composite"].includes(item.pricingMethod)).length;
  return {
    valid: errors.length === 0,
    errors,
    summary: { total: items.length, priced, unpriced: items.length - priced, formula, coveragePercent: items.length ? Math.round(priced / items.length * 10000) / 100 : 0 }
  };
}

function assertUniqueInputKeys(items: SavePriceListItemInput[]): void {
  const keys = new Set<string>();
  for (const item of items) {
    const key = `${item.materialKey}\u0000${item.specKey}`;
    if (keys.has(key)) throw new AppError(422, "VALIDATION_ERROR", `Duplicate material/spec key: ${item.materialKey} / ${item.specKey}`);
    keys.add(key);
  }
}

function isSupportedPricingRule(item: PriceListItem): boolean {
  const rule = item.pricingRule;
  if (!rule || Object.keys(rule).length === 0) return false;
  const preset = rule.type ?? rule.formula;
  if (item.pricingMethod === "area") return preset === "area";
  if (item.pricingMethod === "length") return preset === "length";
  if (item.pricingMethod === "composite") return preset === "composite" || (Array.isArray(rule.components) && rule.components.length > 0);
  return preset === "area" || preset === "length" || preset === "composite" || rule.expression === "baseMatchedTubePrice + 1";
}
