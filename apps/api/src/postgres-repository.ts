import { randomUUID } from "node:crypto";
import type {
  AccountAuthorization,
  AccountStatus,
  AccountSummary,
  AuthorizationSnapshot,
  AssignOrderInput,
  Attachment,
  AuditLog,
  CreateAttachmentInput,
  CreateMaterialVariantInput,
  CreateStockDocumentInput,
  CreateWarehouseInput,
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
  InventoryBalance,
  InventoryLedger,
  InventoryReservation,
  CreateInventoryReservationInput,
  MaterialImportCommitInput,
  MaterialImportPreviewInput,
  MaterialVariant,
  Order,
  OrderAssignment,
  OrderFollowUp,
  OrderStatus,
  PriceList,
  PriceListItem,
  PriceListValidation,
  Project,
  Quote,
  QuoteLine,
  QuoteStatus,
  SalesPricingPreference,
  Role,
  OrganizationEntitlement,
  Permission,
  PermissionGrant,
  ResourceDataScope,
  UpdateAccountAuthorizationInput,
  UpdateOrganizationEntitlementsInput,
  Shipment,
  StockDocument,
  Warehouse,
  SavePriceListItemInput,
  Template,
  TemplateVersion
} from "@usm/contracts";
import { snapshotDesignDraft } from "@usm/domain";
import { and, desc, eq, gte, ilike, inArray, isNull, lte, max, ne, or, sql } from "drizzle-orm";
import type { Database } from "./db/index.js";
import {
  attachments, auditLogs, authorizationAuditLogs, customers, dealerOrganizations, designVersions, designs, idempotencyKeys, loginLogs, members,
  memberDataScopes, memberPermissionGrants, organizationEntitlements, salesPricingPreferences,
  orderAssignments, orderFollowUps, orders, organizations, priceListItems, priceLists, projects, quoteLines, quotes, sessions, shipments, templates,
  templateVersions, users, warehouses, materialVariants, inventoryBalances, inventoryLedger, stockDocuments, inventoryReservations
} from "./db/schema.js";
import { AppError, VersionConflictError } from "./errors.js";
import { isSystemLoginEmail } from "./phone.js";
import type { AuditInput, AuthMembership, IdempotencyRecord, LoginLogInput, LoginLogQuery, LoginLogSummary, Repository } from "./repository.js";
import { recalculateDesignSnapshot } from "./services/configurator.js";
import { ALL_PERMISSIONS, DEALER_MODULES, ERP_MODULES, calculateAuthorization, dataScopeAllowsDelegation, defaultEnabledModules, isPermissionAllowedForOrganization, legacyPermissionsForRole, platformAuthorization } from "./authorization.js";

const iso = (value: Date | string): string => value instanceof Date ? value.toISOString() : value;
const code = (prefix: string): string => `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
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
  const materialCode = [value.materialKey, value.specKey, value.color, value.finish]
    .map((part) => String(part ?? "").trim().replace(/[^\p{L}\p{N}]+/gu, "-"))
    .filter(Boolean)
    .join("-");
  return (materialCode || value.materialKey).slice(0, 100);
};

export function createRepository(database: Database): Repository {
  return new PostgresRepository(database);
}

class PostgresRepository implements Repository {
  readonly mode = "postgres" as const;
  constructor(private readonly db: Database) {}

  async listAvailableTenants(userId: string, includeAllOrganizations = false): Promise<Array<{ id: string; name: string; slug: string }>> {
    if (includeAllOrganizations) {
      return this.db.select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
        .from(organizations);
    }
    return this.db.select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
      .from(members)
      .innerJoin(organizations, eq(organizations.id, members.organizationId))
      .where(and(eq(members.userId, userId), eq(members.status, "active")));
  }

  async resolveMembership(userId: string, preferredTenantId?: string): Promise<AuthMembership | null> {
    const predicates = [eq(members.userId, userId), eq(members.status, "active")];
    if (preferredTenantId) predicates.push(eq(members.organizationId, preferredTenantId));
    const [row] = await this.db.select({
      tenantId: organizations.id, tenantName: organizations.name, tenantSlug: organizations.slug, role: members.role,
      organizationType: organizations.organizationType
    }).from(members).innerJoin(organizations, eq(members.organizationId, organizations.id))
      .where(and(...predicates)).limit(1);
    if (row) {
      return { tenant: { id: row.tenantId, name: row.tenantName, slug: row.tenantSlug }, role: normalizeRole(row.role), organizationType: row.organizationType };
    }
    if (!preferredTenantId) return null;
    const headquartersMemberships = await this.db.select({
      organizationId: members.organizationId,
      role: members.role,
      organizationType: organizations.organizationType
    }).from(members)
      .innerJoin(organizations, eq(organizations.id, members.organizationId))
      .where(and(eq(members.userId, userId), eq(members.status, "active")));
    const headquartersMembership = headquartersMemberships.find((item) => item.organizationType === "hq");
    if (!headquartersMembership) return null;
    const [tenant] = await this.db.select({ id: organizations.id, name: organizations.name, slug: organizations.slug, organizationType: organizations.organizationType })
      .from(organizations).where(and(
        eq(organizations.id, preferredTenantId),
        or(
          eq(organizations.id, headquartersMembership.organizationId),
          eq(organizations.parentOrganizationId, headquartersMembership.organizationId)
        )
      )).limit(1);
    return tenant ? {
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      role: normalizeRole(headquartersMembership.role),
      organizationType: tenant.organizationType,
      delegatedFromTenantId: headquartersMembership.organizationId
    } : null;
  }

  async getAuthorization(userId: string, tenantId: string, role?: Role): Promise<AuthorizationSnapshot> {
    const [globalUser] = await this.db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
    if (globalUser?.role === "admin") return platformAuthorization();
    const [membership] = await this.db.select({
      id: members.id, role: members.role, permissionConfigured: members.permissionConfigured,
      organizationType: organizations.organizationType, globalRole: users.role
    }).from(members).innerJoin(organizations, eq(members.organizationId, organizations.id))
      .innerJoin(users, eq(users.id, members.userId))
      .where(and(eq(members.organizationId, tenantId), eq(members.userId, userId), eq(members.status, "active"))).limit(1);
    if (!membership) return calculateAuthorization({ role: role ?? "member", organizationType: "hq", grants: [] });
    const [entitlements, grantRows, scopeRows] = await Promise.all([
      this.readEntitlements(tenantId),
      membership.permissionConfigured
        ? this.db.select().from(memberPermissionGrants).where(and(
          eq(memberPermissionGrants.organizationId, tenantId),
          eq(memberPermissionGrants.memberId, membership.id)
        ))
        : Promise.resolve([]),
      this.db.select().from(memberDataScopes).where(and(
        eq(memberDataScopes.organizationId, tenantId),
        eq(memberDataScopes.memberId, membership.id)
      ))
    ]);
    // A Better Auth global admin is the platform operator and never inherits
    // persistent enterprise business grants from its organization membership.
    const grants = membership.globalRole === "admin"
      ? []
      : membership.permissionConfigured
        ? grantRows.flatMap(mapPermissionGrant)
        : undefined;
    const dataScopes = membership.globalRole === "admin" ? [] : scopeRows.flatMap(mapResourceDataScope);
    const authorization = calculateAuthorization({
      role: role ?? normalizeRole(membership.role),
      organizationType: membership.organizationType,
      grants, dataScopes, entitlements
    });
    return membership.globalRole === "admin" && !authorization.effectivePermissions.includes("platform.entitlements.manage")
      ? { ...authorization, effectivePermissions: [...authorization.effectivePermissions, "platform.entitlements.manage"] }
      : authorization;
  }

  async getUserSecurityState(userId: string): Promise<{ globalRole: string; mustChangePassword: boolean }> {
    const [user] = await this.db.select({ role: users.role, mustChangePassword: users.mustChangePassword })
      .from(users).where(eq(users.id, userId)).limit(1);
    return { globalRole: user?.role ?? "user", mustChangePassword: user?.mustChangePassword ?? false };
  }

  async setPasswordChangeRequired(userId: string, required: boolean): Promise<void> {
    await this.db.update(users).set({ mustChangePassword: required, updatedAt: new Date() }).where(eq(users.id, userId));
  }

  async getAccountAuthorization(tenantId: string, accountId: string): Promise<AccountAuthorization | null> {
    const [membership] = await this.db.select({
      id: members.id, userId: members.userId, role: members.role, permissionConfigured: members.permissionConfigured,
      organizationType: organizations.organizationType, globalRole: users.role
    }).from(members).innerJoin(organizations, eq(members.organizationId, organizations.id))
      .innerJoin(users, eq(users.id, members.userId))
      .where(and(eq(members.organizationId, tenantId), eq(members.id, accountId))).limit(1);
    if (!membership || membership.globalRole === "admin") return null;
    const [entitlements, grantRows, scopeRows] = await Promise.all([
      this.readEntitlements(tenantId),
      membership.permissionConfigured
        ? this.db.select().from(memberPermissionGrants).where(and(
          eq(memberPermissionGrants.organizationId, tenantId),
          eq(memberPermissionGrants.memberId, membership.id)
        ))
        : Promise.resolve([]),
      this.db.select().from(memberDataScopes).where(and(
        eq(memberDataScopes.organizationId, tenantId),
        eq(memberDataScopes.memberId, membership.id)
      ))
    ]);
    const grants = membership.globalRole === "admin" ? [] : membership.permissionConfigured ? grantRows.flatMap(mapPermissionGrant) : undefined;
    const dataScopes = membership.globalRole === "admin" ? [] : scopeRows.flatMap(mapResourceDataScope);
    const authorization = calculateAuthorization({
      role: normalizeRole(membership.role), organizationType: membership.organizationType, grants, dataScopes, entitlements
    });
    return { ...authorization, accountId: membership.id, userId: membership.userId, grants: grants ?? [] };
  }

  async previewAccountAuthorization(tenantId: string, accountId: string, input: UpdateAccountAuthorizationInput): Promise<AccountAuthorization | null> {
    const [membership] = await this.db.select({
      id: members.id, userId: members.userId, role: members.role, organizationType: organizations.organizationType,
      globalRole: users.role
    }).from(members).innerJoin(organizations, eq(members.organizationId, organizations.id))
      .innerJoin(users, eq(users.id, members.userId))
      .where(and(eq(members.organizationId, tenantId), eq(members.id, accountId))).limit(1);
    if (!membership || membership.globalRole === "admin") return null;
    const dataScopes = [...new Map(input.dataScopes.map((scope) => [scope.resource, scope])).values()];
    const grants = membership.globalRole === "admin" ? [] : input.grants;
    const authorization = calculateAuthorization({
      role: normalizeRole(membership.role),
      organizationType: membership.organizationType,
      grants,
      dataScopes: membership.globalRole === "admin" ? [] : dataScopes,
      entitlements: await this.readEntitlements(tenantId)
    });
    return { ...authorization, accountId: membership.id, userId: membership.userId, grants };
  }

  async updateAccountAuthorization(tenantId: string, accountId: string, input: UpdateAccountAuthorizationInput, actorUserId: string): Promise<AccountAuthorization> {
    const [target] = await this.db.select({
      id: members.id, userId: members.userId, role: members.role,
      organizationType: organizations.organizationType, globalRole: users.role
    })
      .from(members).innerJoin(organizations, eq(members.organizationId, organizations.id))
      .innerJoin(users, eq(users.id, members.userId))
      .where(and(eq(members.organizationId, tenantId), eq(members.id, accountId))).limit(1);
    if (!target || target.globalRole === "admin") throw new AppError(404, "NOT_FOUND", "Account not found");
    const dataScopes = [...new Map(input.dataScopes.map((scope) => [scope.resource, scope])).values()];
    const actor = await this.getAuthorization(actorUserId, tenantId);
    if (!actor.effectivePermissions.includes("permission.delegate")) throw new AppError(403, "FORBIDDEN", "Permission delegation is not allowed");
    const boundaryViolations = input.grants.map((grant) => grant.permission).filter((permission) => !isPermissionAllowedForOrganization(permission, target.organizationType));
    if (boundaryViolations.length) throw new AppError(403, "FORBIDDEN", "The target organization cannot grant these permissions", boundaryViolations);
    const unauthorized = input.grants.map((grant) => grant.permission).filter((permission) => !actor.delegablePermissions.includes(permission));
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
    const before = await this.getAccountAuthorization(tenantId, accountId);
    await this.ensurePermissionAdministrator(tenantId, target.id, target.organizationType, { ...input, dataScopes });
    await this.db.transaction(async (tx) => {
      await tx.delete(memberPermissionGrants).where(and(
        eq(memberPermissionGrants.organizationId, tenantId),
        eq(memberPermissionGrants.memberId, target.id)
      ));
      await tx.delete(memberDataScopes).where(and(
        eq(memberDataScopes.organizationId, tenantId),
        eq(memberDataScopes.memberId, target.id)
      ));
      if (input.grants.length) await tx.insert(memberPermissionGrants).values(input.grants.map((grant) => ({
        id: randomUUID(), organizationId: tenantId, memberId: target.id, permission: grant.permission,
        scope: grant.scope, assignedUserIds: grant.assignedUserIds
      })));
      if (dataScopes.length) await tx.insert(memberDataScopes).values(dataScopes.map((scope) => ({
        id: randomUUID(), organizationId: tenantId, memberId: target.id, resource: scope.resource,
        scope: scope.scope, assignedUserIds: scope.assignedUserIds
      })));
      await tx.update(members).set({ permissionConfigured: true, updatedAt: new Date() }).where(eq(members.id, target.id));
      await tx.insert(authorizationAuditLogs).values({
        id: randomUUID(), organizationId: tenantId, actorUserId, targetMemberId: target.id,
        action: "account.authorization.updated", before: before as unknown as Record<string, unknown>,
        after: input as unknown as Record<string, unknown>
      });
    });
    const updated = await this.getAccountAuthorization(tenantId, accountId);
    if (!updated) throw new AppError(500, "INTERNAL_ERROR", "Authorization update failed");
    return updated;
  }

  private async ensurePermissionAdministrator(
    tenantId: string,
    changingMemberId: string,
    organizationType: "hq" | "dealer",
    input: UpdateAccountAuthorizationInput
  ): Promise<void> {
    const [entitlements, activeMembers] = await Promise.all([
      this.readEntitlements(tenantId),
      this.db.select({ id: members.id, role: members.role, permissionConfigured: members.permissionConfigured })
        .from(members).where(and(eq(members.organizationId, tenantId), eq(members.status, "active")))
    ]);
    if (!entitlements.some((item) => item.module === "accounts" && item.enabled)) return;
    const memberIds = activeMembers.map((member) => member.id);
    const grantRows = memberIds.length
      ? await this.db.select().from(memberPermissionGrants).where(and(
        eq(memberPermissionGrants.organizationId, tenantId),
        inArray(memberPermissionGrants.memberId, memberIds)
      ))
      : [];
    const grantsByMember = new Map<string, PermissionGrant[]>();
    for (const row of grantRows) {
      const grants = grantsByMember.get(row.memberId) ?? [];
      grants.push(...mapPermissionGrant(row));
      grantsByMember.set(row.memberId, grants);
    }
    for (const member of activeMembers) {
      const grants = member.id === changingMemberId
        ? input.grants
        : member.permissionConfigured ? grantsByMember.get(member.id) ?? [] : undefined;
      const authorization = calculateAuthorization({
        role: normalizeRole(member.role), organizationType, grants, entitlements
      });
      if (authorization.effectivePermissions.includes("account.manage") && authorization.effectivePermissions.includes("permission.delegate")) return;
    }
    throw new AppError(409, "VALIDATION_ERROR", "At least one active permission administrator is required");
  }

  async listOrganizationEntitlements(tenantId: string): Promise<OrganizationEntitlement[]> {
    const [organization] = await this.db.select({ type: organizations.organizationType }).from(organizations)
      .where(eq(organizations.id, tenantId)).limit(1);
    if (!organization) throw new AppError(404, "NOT_FOUND", "Organization not found");
    const stored = await this.readEntitlements(tenantId);
    const byModule = new Map(stored.map((item) => [item.module, item]));
    const defaults = new Set(defaultEnabledModules(organization.type));
    return ERP_MODULES.map((module) => byModule.get(module) ?? { module, enabled: defaults.has(module), permissionAllowlist: null });
  }

  async updateOrganizationEntitlements(tenantId: string, input: UpdateOrganizationEntitlementsInput, actorUserId: string): Promise<OrganizationEntitlement[]> {
    const [actor] = await this.db.select({ role: users.role }).from(users).where(eq(users.id, actorUserId)).limit(1);
    if (actor?.role !== "admin") throw new AppError(403, "FORBIDDEN", "Only platform operators can manage organization modules");
    const before = await this.listOrganizationEntitlements(tenantId);
    await this.db.transaction(async (tx) => {
      for (const entitlement of input.entitlements) {
        await tx.insert(organizationEntitlements).values({
          id: randomUUID(), organizationId: tenantId, module: entitlement.module, enabled: entitlement.enabled,
          permissionAllowlist: entitlement.permissionAllowlist
        }).onConflictDoUpdate({
          target: [organizationEntitlements.organizationId, organizationEntitlements.module],
          set: { enabled: entitlement.enabled, permissionAllowlist: entitlement.permissionAllowlist, updatedAt: new Date() }
        });
      }
      await tx.insert(authorizationAuditLogs).values({
        id: randomUUID(), organizationId: tenantId, actorUserId, action: "organization.entitlements.updated",
        before: { entitlements: before }, after: { entitlements: input.entitlements }
      });
    });
    return this.listOrganizationEntitlements(tenantId);
  }

  private async readEntitlements(tenantId: string): Promise<Array<{ module: import("@usm/contracts").ErpModule; enabled: boolean; permissionAllowlist: Permission[] | null }>> {
    const rows = await this.db.select().from(organizationEntitlements).where(eq(organizationEntitlements.organizationId, tenantId));
    return rows.flatMap((row) => {
      if (!ERP_MODULES.includes(row.module as import("@usm/contracts").ErpModule)) return [];
      const rawAllowlist = Array.isArray(row.permissionAllowlist) ? row.permissionAllowlist : null;
      const permissionAllowlist = rawAllowlist?.filter((permission): permission is Permission => ALL_PERMISSIONS.includes(permission as Permission)) ?? null;
      return [{ module: row.module as import("@usm/contracts").ErpModule, enabled: row.enabled, permissionAllowlist }];
    });
  }

  async listTemplates(tenantId: string): Promise<Template[]> {
    const rows = await this.db.select().from(templates).where(eq(templates.tenantId, tenantId)).orderBy(desc(templates.updatedAt));
    return Promise.all(rows.map((row) => this.mapTemplate(row)));
  }
  async getTemplate(tenantId: string, id: string): Promise<Template | null> {
    const [row] = await this.db.select().from(templates).where(and(eq(templates.tenantId, tenantId), eq(templates.id, id))).limit(1);
    return row ? this.mapTemplate(row) : null;
  }

  async listWarehouses(tenantId: string): Promise<Warehouse[]> {
    const rows = await this.db.select().from(warehouses).where(eq(warehouses.tenantId, tenantId)).orderBy(desc(warehouses.updatedAt));
    return rows.map(mapWarehouse);
  }
  async createWarehouse(tenantId: string, input: CreateWarehouseInput): Promise<Warehouse> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx.select().from(warehouses).where(and(eq(warehouses.tenantId, tenantId), eq(warehouses.code, input.code))).limit(1);
      if (existing) return mapWarehouse(existing);
      if (input.isDefault ?? false) await tx.update(warehouses).set({ isDefault: false, updatedAt: new Date() }).where(eq(warehouses.tenantId, tenantId));
      const [row] = await tx.insert(warehouses).values({ id: randomUUID(), tenantId, code: input.code, name: input.name, isDefault: input.isDefault ?? false }).returning();
      return mapWarehouse(row);
    });
  }
  async listMaterials(tenantId: string, search?: string): Promise<MaterialVariant[]> {
    const rows = await this.db.select().from(materialVariants).where(eq(materialVariants.tenantId, tenantId)).orderBy(desc(materialVariants.updatedAt));
    const needle = search?.trim().toLowerCase();
    return rows.filter((row) => !needle || [
      row.materialCode, row.materialKey, row.specKey, row.category, row.color, row.finish,
      row.name, row.specification, row.note, row.source
    ].some((value) => value.toLowerCase().includes(needle))).map(mapMaterialVariant);
  }
  async getMaterialByKey(tenantId: string, key: Pick<MaterialVariant, "materialKey" | "specKey" | "color" | "finish">): Promise<MaterialVariant | null> {
    const [row] = await this.db.select().from(materialVariants).where(and(eq(materialVariants.tenantId, tenantId), eq(materialVariants.materialKey, key.materialKey), eq(materialVariants.specKey, key.specKey), eq(materialVariants.color, key.color), eq(materialVariants.finish, key.finish))).limit(1);
    return row ? mapMaterialVariant(row) : null;
  }
  async createMaterial(tenantId: string, input: CreateMaterialVariantInput): Promise<MaterialVariant> {
    const materialCode = input.materialCode ?? derivedMaterialCode(input);
    const values = {
      materialCode, materialKey: input.materialKey, specKey: input.specKey, category: input.category ?? "",
      color: input.color ?? "", finish: input.finish ?? "", name: input.name,
      specification: input.specification ?? "", unit: input.unit ?? "pcs", weightKg: input.weightKg ?? null,
      referenceCostMinor: input.referenceCostMinor ?? null, note: input.note ?? "", source: input.source ?? "",
      active: input.active ?? true
    };
    const [existingByCode] = await this.db.select().from(materialVariants)
      .where(and(eq(materialVariants.tenantId, tenantId), eq(materialVariants.materialCode, materialCode))).limit(1);
    if (existingByCode) {
      const [row] = await this.db.update(materialVariants).set({
        ...values, revision: sql`${materialVariants.revision} + 1`, updatedAt: new Date()
      }).where(eq(materialVariants.id, existingByCode.id)).returning();
      return mapMaterialVariant(row);
    }
    const [row] = await this.db.insert(materialVariants).values({ id: randomUUID(), tenantId, ...values })
      .onConflictDoUpdate({
        target: [materialVariants.tenantId, materialVariants.materialKey, materialVariants.specKey, materialVariants.color, materialVariants.finish],
        set: { ...values, revision: sql`${materialVariants.revision} + 1`, updatedAt: new Date() }
      }).returning();
    return mapMaterialVariant(row);
  }
  async listInventoryBalances(tenantId: string, warehouseId?: string, materialIds?: string[]): Promise<InventoryBalance[]> {
    const predicates = [eq(inventoryBalances.tenantId, tenantId)];
    if (warehouseId) predicates.push(eq(inventoryBalances.warehouseId, warehouseId));
    if (materialIds?.length) predicates.push(inArray(inventoryBalances.materialId, materialIds));
    const rows = await this.db.select({ balance: inventoryBalances, material: materialVariants }).from(inventoryBalances).innerJoin(materialVariants, eq(inventoryBalances.materialId, materialVariants.id)).where(and(...predicates)).orderBy(desc(inventoryBalances.updatedAt));
    return rows.map(({ balance, material }) => ({ ...mapInventoryBalance(balance), materialKey: material.materialKey, specKey: material.specKey, color: material.color, finish: material.finish }));
  }
  async listInventoryLedger(tenantId: string, warehouseId?: string, materialId?: string): Promise<InventoryLedger[]> {
    const predicates = [eq(inventoryLedger.tenantId, tenantId)];
    if (warehouseId) predicates.push(eq(inventoryLedger.warehouseId, warehouseId));
    if (materialId) predicates.push(eq(inventoryLedger.materialId, materialId));
    return (await this.db.select().from(inventoryLedger).where(and(...predicates)).orderBy(desc(inventoryLedger.createdAt))).map(mapInventoryLedger);
  }
  async listStockDocuments(tenantId: string, type?: StockDocument["type"]): Promise<StockDocument[]> {
    const predicates = [eq(stockDocuments.tenantId, tenantId)];
    if (type) predicates.push(eq(stockDocuments.type, type));
    return (await this.db.select().from(stockDocuments).where(and(...predicates)).orderBy(desc(stockDocuments.updatedAt))).map(mapStockDocument);
  }
  async listInventoryReservations(tenantId: string, orderId?: string): Promise<InventoryReservation[]> {
    const predicates = [eq(inventoryReservations.tenantId, tenantId)];
    if (orderId) predicates.push(eq(inventoryReservations.orderId, orderId));
    return (await this.db.select().from(inventoryReservations).where(and(...predicates)).orderBy(desc(inventoryReservations.updatedAt))).map(mapInventoryReservation);
  }
  async createStockDocument(tenantId: string, input: CreateStockDocumentInput, actorUserId: string): Promise<StockDocument> {
    let warehouseId = input.warehouseId;
    if (!warehouseId) warehouseId = (await this.listWarehouses(tenantId)).find((item) => item.isDefault)?.id;
    if (!warehouseId) warehouseId = (await this.createWarehouse(tenantId, { code: "MAIN", name: "Main warehouse", isDefault: true })).id;
    if (input.type === "transfer" && !input.targetWarehouseId) throw new AppError(422, "VALIDATION_ERROR", "targetWarehouseId is required for transfer");
    const lines = [] as Array<Record<string, unknown>>;
    for (const line of input.lines) {
      const material = line.materialId ? (await this.db.select().from(materialVariants).where(and(eq(materialVariants.tenantId, tenantId), eq(materialVariants.id, line.materialId))).limit(1))[0] : await this.getMaterialByKey(tenantId, { materialKey: line.materialKey, specKey: line.specKey, color: line.color ?? "", finish: line.finish ?? "" });
      if (!material) throw new AppError(422, "VALIDATION_ERROR", `Unknown material variant: ${line.materialKey}/${line.specKey}`);
      lines.push({ ...line, materialId: material.id, color: line.color ?? "", finish: line.finish ?? "" });
    }
    const [row] = await this.db.insert(stockDocuments).values({
      id: randomUUID(), tenantId, code: code("STK"), type: input.type, status: "draft", warehouseId,
      targetWarehouseId: input.targetWarehouseId ?? null, orderId: input.orderId ?? null,
      sourceBatchId: input.sourceBatchId ?? null, note: input.note ?? null, lines
    }).returning();
    return mapStockDocument(row);
  }
  async postStockDocument(tenantId: string, id: string, actorUserId: string): Promise<StockDocument> {
    return this.db.transaction(async (tx) => {
      const [doc] = await tx.select().from(stockDocuments).where(and(eq(stockDocuments.tenantId, tenantId), eq(stockDocuments.id, id))).limit(1);
      if (!doc) throw new AppError(404, "NOT_FOUND", "Stock document not found");
      if (doc.status !== "draft") throw new AppError(409, "INVALID_TRANSITION", "Only draft stock documents can be posted");
      const lines = doc.lines as Array<Record<string, any>>;
      for (const line of lines) {
        const materialId = String(line.materialId);
        const [balance] = await tx.select().from(inventoryBalances).where(and(eq(inventoryBalances.tenantId, tenantId), eq(inventoryBalances.warehouseId, doc.warehouseId), eq(inventoryBalances.materialId, materialId))).limit(1);
        const currentOnHand = balance?.onHandQty ?? 0;
        const currentReserved = balance?.reservedQty ?? 0;
        const qty = Number(line.qty);
        const delta = doc.type === "issue" || doc.type === "transfer" ? -qty : qty;
        const reservedRelease = doc.type === "issue" && doc.orderId ? Math.min(currentReserved, qty) : 0;
        const effectiveReserved = currentReserved - reservedRelease;
        if ((doc.type === "issue" || doc.type === "transfer") && currentOnHand - effectiveReserved < qty) throw new AppError(409, "VALIDATION_ERROR", "Insufficient inventory");
        if (currentOnHand + delta < effectiveReserved) throw new AppError(409, "VALIDATION_ERROR", "Inventory on-hand quantity cannot be below reserved quantity");
        if (balance) await tx.update(inventoryBalances).set({ onHandQty: currentOnHand + delta, reservedQty: effectiveReserved, revision: sql`${inventoryBalances.revision} + 1`, updatedAt: new Date() }).where(eq(inventoryBalances.id, balance.id));
        else await tx.insert(inventoryBalances).values({ id: randomUUID(), tenantId, warehouseId: doc.warehouseId, materialId, onHandQty: delta, reservedQty: 0 });
        await tx.insert(inventoryLedger).values({ id: randomUUID(), tenantId, warehouseId: doc.warehouseId, materialId, direction: doc.type === "adjust" ? "adjust" : delta > 0 ? "receive" : "issue", quantity: qty, deltaQty: delta, referenceType: "stock_document", referenceId: doc.id, note: doc.note, actorUserId });
        if (doc.type === "transfer" && doc.targetWarehouseId) {
          const [target] = await tx.select().from(inventoryBalances).where(and(eq(inventoryBalances.tenantId, tenantId), eq(inventoryBalances.warehouseId, doc.targetWarehouseId), eq(inventoryBalances.materialId, materialId))).limit(1);
          if (target) await tx.update(inventoryBalances).set({ onHandQty: target.onHandQty + qty, revision: sql`${inventoryBalances.revision} + 1`, updatedAt: new Date() }).where(eq(inventoryBalances.id, target.id));
          else await tx.insert(inventoryBalances).values({ id: randomUUID(), tenantId, warehouseId: doc.targetWarehouseId, materialId, onHandQty: qty, reservedQty: 0 });
          await tx.insert(inventoryLedger).values({ id: randomUUID(), tenantId, warehouseId: doc.targetWarehouseId, materialId, direction: "receive", quantity: qty, deltaQty: qty, referenceType: "stock_document", referenceId: doc.id, note: doc.note, actorUserId });
        }
      }
      const [updated] = await tx.update(stockDocuments).set({ status: "posted", postedAt: new Date(), postedByUserId: actorUserId, revision: sql`${stockDocuments.revision} + 1`, updatedAt: new Date() }).where(and(eq(stockDocuments.id, id), eq(stockDocuments.status, "draft"))).returning();
      return mapStockDocument(updated);
    });
  }
  async reverseStockDocument(tenantId: string, id: string, actorUserId: string): Promise<StockDocument> {
    return this.db.transaction(async (tx) => {
      const [doc] = await tx.select().from(stockDocuments).where(and(eq(stockDocuments.tenantId, tenantId), eq(stockDocuments.id, id))).limit(1);
      if (!doc) throw new AppError(404, "NOT_FOUND", "Stock document not found");
      if (doc.status !== "posted") throw new AppError(409, "INVALID_TRANSITION", "Only posted stock documents can be reversed");
      const lines = doc.lines as Array<Record<string, any>>;
      for (const line of lines) {
        const materialId = String(line.materialId); const qty = Number(line.qty);
        const delta = doc.type === "issue" || doc.type === "transfer" ? qty : -qty;
        const [balance] = await tx.select().from(inventoryBalances).where(and(eq(inventoryBalances.tenantId, tenantId), eq(inventoryBalances.warehouseId, doc.warehouseId), eq(inventoryBalances.materialId, materialId))).limit(1);
        if (!balance || balance.onHandQty + delta < balance.reservedQty || balance.onHandQty + delta < 0) throw new AppError(409, "VALIDATION_ERROR", "Cannot reverse below zero on-hand quantity");
        await tx.update(inventoryBalances).set({ onHandQty: balance.onHandQty + delta, revision: sql`${inventoryBalances.revision} + 1`, updatedAt: new Date() }).where(eq(inventoryBalances.id, balance.id));
        await tx.insert(inventoryLedger).values({ id: randomUUID(), tenantId, warehouseId: doc.warehouseId, materialId, direction: "reverse", quantity: qty, deltaQty: delta, referenceType: "stock_document", referenceId: doc.id, note: doc.note, actorUserId });
        if (doc.type === "transfer" && doc.targetWarehouseId) {
          const [target] = await tx.select().from(inventoryBalances).where(and(eq(inventoryBalances.tenantId, tenantId), eq(inventoryBalances.warehouseId, doc.targetWarehouseId), eq(inventoryBalances.materialId, materialId))).limit(1);
          if (!target || target.onHandQty < qty || target.onHandQty - qty < target.reservedQty) throw new AppError(409, "VALIDATION_ERROR", "Cannot reverse transfer from target warehouse");
          await tx.update(inventoryBalances).set({ onHandQty: target.onHandQty - qty, revision: sql`${inventoryBalances.revision} + 1`, updatedAt: new Date() }).where(eq(inventoryBalances.id, target.id));
          await tx.insert(inventoryLedger).values({ id: randomUUID(), tenantId, warehouseId: doc.targetWarehouseId, materialId, direction: "reverse", quantity: qty, deltaQty: -qty, referenceType: "stock_document", referenceId: doc.id, note: doc.note, actorUserId });
        }
      }
      const [updated] = await tx.update(stockDocuments).set({ status: "reversed", revision: sql`${stockDocuments.revision} + 1`, updatedAt: new Date() }).where(and(eq(stockDocuments.id, id), eq(stockDocuments.status, "posted"))).returning();
      return mapStockDocument(updated);
    });
  }
  async createInventoryReservation(tenantId: string, input: CreateInventoryReservationInput, actorUserId: string): Promise<InventoryReservation[]> {
    let warehouseId = input.warehouseId;
    if (!warehouseId) warehouseId = (await this.listWarehouses(tenantId)).find((item) => item.isDefault)?.id;
    if (!warehouseId) warehouseId = (await this.createWarehouse(tenantId, { code: "MAIN", name: "Main warehouse", isDefault: true })).id;
    const resolved: Array<{ materialId: string; qty: number }> = [];
    for (const req of input.requirements) {
      const material = req.materialId ? (await this.db.select().from(materialVariants).where(and(eq(materialVariants.tenantId, tenantId), eq(materialVariants.id, req.materialId))).limit(1))[0] : await this.getMaterialByKey(tenantId, { materialKey: req.materialKey, specKey: req.specKey, color: req.color ?? "", finish: req.finish ?? "" });
      if (!material) throw new AppError(422, "VALIDATION_ERROR", `Unknown material variant: ${req.materialKey}/${req.specKey}`);
      resolved.push({ materialId: material.id, qty: req.qty });
    }
    return this.db.transaction(async (tx) => {
      const result: InventoryReservation[] = [];
      for (const req of resolved) {
        const [balance] = await tx.select().from(inventoryBalances).where(and(eq(inventoryBalances.tenantId, tenantId), eq(inventoryBalances.warehouseId, warehouseId!), eq(inventoryBalances.materialId, req.materialId))).limit(1);
        if (!balance || balance.onHandQty - balance.reservedQty < req.qty) throw new AppError(409, "VALIDATION_ERROR", "Insufficient inventory for reservation");
      }
      for (const req of resolved) {
        const [balance] = await tx.select().from(inventoryBalances).where(and(eq(inventoryBalances.tenantId, tenantId), eq(inventoryBalances.warehouseId, warehouseId!), eq(inventoryBalances.materialId, req.materialId))).limit(1);
        await tx.update(inventoryBalances).set({ reservedQty: balance.reservedQty + req.qty, revision: sql`${inventoryBalances.revision} + 1`, updatedAt: new Date() }).where(eq(inventoryBalances.id, balance.id));
        const [row] = await tx.insert(inventoryReservations).values({ id: randomUUID(), tenantId, orderId: input.orderId, warehouseId: warehouseId!, materialId: req.materialId, qty: req.qty, status: "active" }).returning();
        await tx.insert(inventoryLedger).values({ id: randomUUID(), tenantId, warehouseId: warehouseId!, materialId: req.materialId, direction: "reserve", quantity: req.qty, deltaQty: 0, referenceType: "order", referenceId: input.orderId, note: "order reservation", actorUserId });
        result.push(mapInventoryReservation(row));
      }
      return result;
    });
  }
  async issueInventoryReservation(tenantId: string, input: CreateInventoryReservationInput, actorUserId: string): Promise<{ document: StockDocument; reservations: InventoryReservation[] }> {
    let warehouseId = input.warehouseId;
    if (!warehouseId) warehouseId = (await this.listWarehouses(tenantId)).find((item) => item.isDefault)?.id;
    if (!warehouseId) warehouseId = (await this.createWarehouse(tenantId, { code: "MAIN", name: "Main warehouse", isDefault: true })).id;
    return this.db.transaction(async (tx) => {
      const [warehouse] = await tx.select().from(warehouses).where(and(eq(warehouses.tenantId, tenantId), eq(warehouses.id, warehouseId!))).limit(1);
      if (!warehouse) throw new AppError(404, "NOT_FOUND", "Warehouse not found");
      const lines: StockDocument["lines"] = [];
      for (const requirement of input.requirements) {
        const material = requirement.materialId
          ? (await tx.select().from(materialVariants).where(and(eq(materialVariants.tenantId, tenantId), eq(materialVariants.id, requirement.materialId))).limit(1))[0]
          : (await tx.select().from(materialVariants).where(and(
            eq(materialVariants.tenantId, tenantId), eq(materialVariants.materialKey, requirement.materialKey),
            eq(materialVariants.specKey, requirement.specKey), eq(materialVariants.color, requirement.color ?? ""),
            eq(materialVariants.finish, requirement.finish ?? "")
          )).limit(1))[0];
        if (!material) throw new AppError(422, "VALIDATION_ERROR", `Unknown material variant: ${requirement.materialKey}/${requirement.specKey}`);
        lines.push({
          materialId: material.id, materialKey: requirement.materialKey, specKey: requirement.specKey,
          color: requirement.color ?? "", finish: requirement.finish ?? "", qty: requirement.qty
        });
      }

      const stamp = new Date();
      const [documentRow] = await tx.insert(stockDocuments).values({
        id: randomUUID(), tenantId, code: code("STK"), type: "issue", status: "posted", warehouseId,
        targetWarehouseId: null, orderId: input.orderId, sourceBatchId: null, note: "order material issue",
        lines, postedAt: stamp, postedByUserId: actorUserId, revision: 2, createdAt: stamp, updatedAt: stamp
      }).returning();
      const reservations: InventoryReservation[] = [];
      for (const line of lines) {
        const rows = await tx.select().from(inventoryReservations).where(and(
          eq(inventoryReservations.tenantId, tenantId), eq(inventoryReservations.orderId, input.orderId),
          eq(inventoryReservations.warehouseId, warehouseId!), eq(inventoryReservations.materialId, line.materialId!),
          eq(inventoryReservations.status, "active")
        )).orderBy(inventoryReservations.createdAt).for("update");
        let remaining = line.qty;
        for (const row of rows) {
          if (remaining <= 0) break;
          const issuable = Math.min(remaining, Math.max(0, row.qty - row.issuedQty - row.releasedQty));
          if (!issuable) continue;
          const issuedQty = row.issuedQty + issuable;
          const [updated] = await tx.update(inventoryReservations).set({ issuedQty, status: issuedQty + row.releasedQty >= row.qty ? "consumed" : "active", revision: sql`${inventoryReservations.revision} + 1`, updatedAt: new Date() }).where(and(eq(inventoryReservations.id, row.id), eq(inventoryReservations.status, "active"))).returning();
          if (!updated) throw new AppError(409, "VERSION_CONFLICT", "Inventory reservation changed while issuing material");
          reservations.push(mapInventoryReservation(updated));
          remaining -= issuable;
        }

        const reservedRelease = line.qty - remaining;
        const [balance] = await tx.select().from(inventoryBalances).where(and(
          eq(inventoryBalances.tenantId, tenantId), eq(inventoryBalances.warehouseId, warehouseId!),
          eq(inventoryBalances.materialId, line.materialId!)
        )).limit(1).for("update");
        const availableAfterReservation = balance ? balance.onHandQty - (balance.reservedQty - reservedRelease) : 0;
        if (!balance || balance.reservedQty < reservedRelease || availableAfterReservation < line.qty) {
          throw new AppError(409, "VALIDATION_ERROR", `Insufficient inventory for ${line.materialKey}`, {
            availableQty: Math.max(0, availableAfterReservation), requestedQty: line.qty
          });
        }
        await tx.update(inventoryBalances).set({
          onHandQty: balance.onHandQty - line.qty, reservedQty: balance.reservedQty - reservedRelease,
          revision: sql`${inventoryBalances.revision} + 1`, updatedAt: stamp
        }).where(eq(inventoryBalances.id, balance.id));
        await tx.insert(inventoryLedger).values({
          id: randomUUID(), tenantId, warehouseId, materialId: line.materialId!, direction: "issue",
          quantity: line.qty, deltaQty: -line.qty, referenceType: "stock_document", referenceId: documentRow.id,
          note: documentRow.note, actorUserId, createdAt: stamp, updatedAt: stamp
        });
      }
      return { document: mapStockDocument(documentRow), reservations };
    });
  }
  async releaseInventoryReservation(tenantId: string, orderId: string, actorUserId: string): Promise<InventoryReservation[]> {
    return this.db.transaction(async (tx) => {
      const rows = await tx.select().from(inventoryReservations).where(and(eq(inventoryReservations.tenantId, tenantId), eq(inventoryReservations.orderId, orderId), eq(inventoryReservations.status, "active")));
      const result: InventoryReservation[] = [];
      for (const row of rows) {
        const releasableQty = Math.max(0, row.qty - row.issuedQty - row.releasedQty);
        const [balance] = await tx.select().from(inventoryBalances).where(and(eq(inventoryBalances.tenantId, tenantId), eq(inventoryBalances.warehouseId, row.warehouseId), eq(inventoryBalances.materialId, row.materialId))).limit(1);
        if (balance && releasableQty > 0) await tx.update(inventoryBalances).set({ reservedQty: Math.max(0, balance.reservedQty - releasableQty), revision: sql`${inventoryBalances.revision} + 1`, updatedAt: new Date() }).where(eq(inventoryBalances.id, balance.id));
        const [updated] = await tx.update(inventoryReservations).set({ releasedQty: row.releasedQty + releasableQty, status: "released", revision: sql`${inventoryReservations.revision} + 1`, updatedAt: new Date() }).where(and(eq(inventoryReservations.id, row.id), eq(inventoryReservations.status, "active"))).returning();
        if (releasableQty > 0) await tx.insert(inventoryLedger).values({ id: randomUUID(), tenantId, warehouseId: row.warehouseId, materialId: row.materialId, direction: "release", quantity: releasableQty, deltaQty: 0, referenceType: "order", referenceId: orderId, note: "order reservation released", actorUserId });
        result.push(mapInventoryReservation(updated));
      }
      return result;
    });
  }
  async previewMaterialImport(tenantId: string, input: MaterialImportPreviewInput) {
    const materialRows: NonNullable<MaterialImportCommitInput["materialRows"]> = [];
    const openingRows: NonNullable<MaterialImportCommitInput["openingRows"]> = [];
    const errors: Array<{ sheet?: string; row: number; message: string }> = [];
    let created = 0; let updated = 0; let skipped = 0; let conflicts = 0;
    const existing = await this.listMaterials(tenantId);
    const rawMaterials = input.materialRows?.length ? input.materialRows : (input.rows ?? []);
    const hasExplicitOpeningRows = Boolean(input.openingRows?.length);
    const seenCodes = new Set<string>();
    rawMaterials.forEach((raw, index) => {
      if (!raw || typeof raw !== "object") { errors.push({ sheet: "materials", row: index + 2, message: "Row must be an object" }); return; }
      const value = raw as Record<string, unknown>;
      const materialKey = String(value.materialKey ?? value.materialCode ?? "").trim();
      const specKey = String(value.specKey ?? value.spec ?? value.specification ?? "").trim();
      const explicitMaterialCode = String(value.materialCode ?? "").trim();
      const materialCode = explicitMaterialCode || derivedMaterialCode({ materialKey, specKey, color: String(value.color ?? ""), finish: String(value.finish ?? "") });
      const name = String(value.name ?? materialKey).trim();
      const openingQty = Number(value.openingQty ?? value.qty ?? 0);
      if (!materialCode || !materialKey || !specKey || !name || !Number.isInteger(openingQty) || openingQty < 0) { errors.push({ sheet: "materials", row: index + 2, message: "materialCode, materialKey, specKey, name and non-negative integer openingQty are required" }); return; }
      const referenceCost = optionalImportNumber(value.referenceCost);
      const weightKg = optionalImportNumber(value.weightKg);
      if ((referenceCost !== undefined && (!Number.isFinite(referenceCost) || referenceCost < 0)) || (weightKg !== undefined && (!Number.isFinite(weightKg) || weightKg < 0))) { errors.push({ sheet: "materials", row: index + 2, message: "weightKg and referenceCost must be non-negative numbers" }); return; }
      const item = { materialCode, materialKey, specKey, category: optionalImportText(value.category), color: optionalImportText(value.color), finish: optionalImportText(value.finish), name, specification: optionalImportText(value.specification ?? value.spec), unit: optionalImportText(value.unit), weightKg, referenceCost, active: optionalImportBoolean(value.active), note: optionalImportText(value.note), source: optionalImportText(value.source), openingQty };
      if (seenCodes.has(materialCode) || materialRows.some((candidate) => materialIdentity(candidate) === materialIdentity(item))) { conflicts += 1; return; }
      seenCodes.add(materialCode);
      materialRows.push(item);
      if (!hasExplicitOpeningRows && openingQty > 0) {
        openingRows.push({ warehouseCode: "MAIN", materialCode, openingQty, note: item.note || undefined });
      }
      if (existing.some((candidate) => candidate.materialCode === materialCode || materialIdentity(candidate) === materialIdentity(item))) updated += 1; else created += 1;
    });
    (input.openingRows ?? []).forEach((raw, index) => {
      if (!raw || typeof raw !== "object") { errors.push({ sheet: "opening", row: index + 2, message: "Row must be an object" }); return; }
      const value = raw as Record<string, unknown>;
      const warehouseCode = String(value.warehouseCode ?? "MAIN").trim();
      const materialCode = String(value.materialCode ?? value.materialKey ?? "").trim();
      const openingQty = Number(value.openingQty ?? value.qty ?? 0);
      if (!warehouseCode || !materialCode || !Number.isInteger(openingQty) || openingQty < 0) { errors.push({ sheet: "opening", row: index + 2, message: "warehouseCode, materialCode and non-negative integer openingQty are required" }); return; }
      openingRows.push({ warehouseCode, materialCode, openingQty, location: String(value.location ?? "") || undefined, batchNo: String(value.batchNo ?? "") || undefined, note: String(value.note ?? "") || undefined });
    });
    if (!materialRows.length && !openingRows.length && !errors.length) skipped = rawMaterials.length + (input.openingRows?.length ?? 0);
    return { materialRows, openingRows, created, updated, skipped, conflicts, errors };
  }
  async commitMaterialImport(tenantId: string, input: MaterialImportCommitInput, actorUserId: string) {
    return this.db.transaction(async (tx) => {
      const saveBatchResult = async (result: { materials: MaterialVariant[]; openingDocument: StockDocument | null }) => {
        if (!input.batchId) return;
        await tx.insert(idempotencyKeys).values({
          id: randomUUID(), tenantId, route: materialImportBatchRoute, key: input.batchId,
          requestHash: input.batchId, statusCode: 201, response: result,
          resourceType: "material_import", resourceId: result.openingDocument?.id ?? null,
          expiresAt: new Date("9999-12-31T23:59:59.999Z")
        }).onConflictDoNothing();
      };

      if (input.batchId) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${input.batchId}))`);
        const [existingBatch] = await tx.select({ response: idempotencyKeys.response }).from(idempotencyKeys).where(and(
          eq(idempotencyKeys.tenantId, tenantId), eq(idempotencyKeys.route, materialImportBatchRoute), eq(idempotencyKeys.key, input.batchId)
        )).limit(1);
        if (existingBatch) return existingBatch.response as { materials: MaterialVariant[]; openingDocument: StockDocument | null };

        const existingDocuments = await tx.select().from(stockDocuments).where(and(
          eq(stockDocuments.tenantId, tenantId),
          or(eq(stockDocuments.sourceBatchId, input.batchId), sql<boolean>`starts_with(${stockDocuments.sourceBatchId}, ${`${input.batchId}:`})`)
        ));
        if (existingDocuments.length) {
          const materialIds = [...new Set(existingDocuments.flatMap((document) => (document.lines as Array<Record<string, unknown>>).map((line) => String(line.materialId ?? "")).filter(Boolean)))];
          const existingMaterials = materialIds.length
            ? (await tx.select().from(materialVariants).where(and(eq(materialVariants.tenantId, tenantId), inArray(materialVariants.id, materialIds)))).map(mapMaterialVariant)
            : [];
          const result = { materials: existingMaterials, openingDocument: mapStockDocument(existingDocuments[0]) };
          await saveBatchResult(result);
          return result;
        }
      }

      const preview = await this.previewMaterialImport(tenantId, input);
      if (preview.errors.length) throw new AppError(422, "VALIDATION_ERROR", "Material import contains invalid rows", preview.errors);
      const materials: MaterialVariant[] = [];
      for (const row of preview.materialRows) {
        const materialCode = row.materialCode ?? derivedMaterialCode(row);
        const [existingByCode] = await tx.select().from(materialVariants).where(and(
          eq(materialVariants.tenantId, tenantId), eq(materialVariants.materialCode, materialCode)
        )).limit(1);
        const [existingByIdentity] = existingByCode ? [] : await tx.select().from(materialVariants).where(and(
          eq(materialVariants.tenantId, tenantId), eq(materialVariants.materialKey, row.materialKey), eq(materialVariants.specKey, row.specKey),
          eq(materialVariants.color, row.color ?? ""), eq(materialVariants.finish, row.finish ?? "")
        )).limit(1);
        const existing = existingByCode ?? existingByIdentity;
        const values = {
          materialCode, materialKey: row.materialKey, specKey: row.specKey,
          category: row.category ?? existing?.category ?? "", color: row.color ?? existing?.color ?? "", finish: row.finish ?? existing?.finish ?? "",
          name: row.name, specification: row.specification ?? existing?.specification ?? "", unit: row.unit ?? existing?.unit ?? "pcs",
          weightKg: row.weightKg === undefined ? existing?.weightKg ?? null : row.weightKg,
          referenceCostMinor: row.referenceCost === undefined ? existing?.referenceCostMinor ?? null : Math.round(row.referenceCost * 100),
          note: row.note ?? existing?.note ?? "", source: row.source ?? existing?.source ?? "", active: row.active ?? existing?.active ?? true
        };
        const [saved] = existing
          ? await tx.update(materialVariants).set({ ...values, revision: sql`${materialVariants.revision} + 1`, updatedAt: new Date() }).where(eq(materialVariants.id, existing.id)).returning()
          : await tx.insert(materialVariants).values({ id: randomUUID(), tenantId, ...values }).returning();
        materials.push(mapMaterialVariant(saved));
      }

      const byCode = new Map(materials.map((material) => [material.materialCode, material]));
      const existingOpeningCodes = [...new Set(preview.openingRows.map((row) => row.materialCode).filter((materialCode) => !byCode.has(materialCode)))];
      if (existingOpeningCodes.length) {
        const existingRows = await tx.select().from(materialVariants)
          .where(and(eq(materialVariants.tenantId, tenantId), inArray(materialVariants.materialCode, existingOpeningCodes)));
        for (const row of existingRows) byCode.set(row.materialCode, mapMaterialVariant(row));
      }

      const grouped = new Map<string, { warehouseId?: string; warehouseCode?: string; lines: CreateStockDocumentInput["lines"] }>();
      const addLine = (warehouseId: string | undefined, warehouseCode: string | undefined, material: MaterialVariant, qty: number, note?: string) => {
        if (qty <= 0) return;
        const key = warehouseId ?? `code:${warehouseCode ?? "default"}`;
        const group = grouped.get(key) ?? { warehouseId, warehouseCode, lines: [] };
        group.lines.push({ materialId: material.id, materialKey: material.materialKey, specKey: material.specKey, color: material.color, finish: material.finish, qty, note });
        grouped.set(key, group);
      };
      const useRequestedWarehouse = Boolean(input.warehouseId && !input.openingRows?.length);
      for (const row of preview.openingRows) {
        const material = byCode.get(row.materialCode);
        if (!material) throw new AppError(422, "VALIDATION_ERROR", `Unknown material code in opening inventory: ${row.materialCode}`);
        addLine(useRequestedWarehouse ? input.warehouseId : undefined, useRequestedWarehouse ? undefined : row.warehouseCode, material, row.openingQty, row.note);
      }

      let openingDocument: StockDocument | null = null;
      let groupIndex = 0;
      for (const group of grouped.values()) {
        groupIndex += 1;
        let warehouseId = group.warehouseId;
        if (!warehouseId && group.warehouseCode) {
          const [existingWarehouse] = await tx.select().from(warehouses).where(and(eq(warehouses.tenantId, tenantId), eq(warehouses.code, group.warehouseCode))).limit(1);
          if (existingWarehouse) warehouseId = existingWarehouse.id;
          else {
            const [createdWarehouse] = await tx.insert(warehouses).values({ id: randomUUID(), tenantId, code: group.warehouseCode, name: group.warehouseCode, isDefault: false }).returning();
            warehouseId = createdWarehouse.id;
          }
        }
        if (!warehouseId) {
          const [defaultWarehouse] = await tx.select().from(warehouses).where(and(eq(warehouses.tenantId, tenantId), eq(warehouses.isDefault, true))).limit(1);
          if (defaultWarehouse) warehouseId = defaultWarehouse.id;
          else {
            const [createdWarehouse] = await tx.insert(warehouses).values({ id: randomUUID(), tenantId, code: "MAIN", name: "Main warehouse", isDefault: true }).returning();
            warehouseId = createdWarehouse.id;
          }
        }

        const sourceBatchId = input.batchId && grouped.size > 1
          ? `${input.batchId.slice(0, Math.max(1, 99 - String(groupIndex).length))}:${groupIndex}`
          : input.batchId;
        const [document] = await tx.insert(stockDocuments).values({
          id: randomUUID(), tenantId, code: code("STK"), type: "receive", status: "draft", warehouseId,
          targetWarehouseId: null, orderId: null, sourceBatchId: sourceBatchId ?? null,
          note: `material import${input.source ? `: ${input.source}` : ""}`, lines: group.lines
        }).returning();
        for (const line of group.lines) {
          const materialId = String(line.materialId);
          const qty = Number(line.qty);
          const [balance] = await tx.select().from(inventoryBalances).where(and(
            eq(inventoryBalances.tenantId, tenantId), eq(inventoryBalances.warehouseId, warehouseId), eq(inventoryBalances.materialId, materialId)
          )).limit(1);
          if (balance) {
            await tx.update(inventoryBalances).set({ onHandQty: balance.onHandQty + qty, revision: sql`${inventoryBalances.revision} + 1`, updatedAt: new Date() }).where(eq(inventoryBalances.id, balance.id));
          } else {
            await tx.insert(inventoryBalances).values({ id: randomUUID(), tenantId, warehouseId, materialId, onHandQty: qty, reservedQty: 0 });
          }
          await tx.insert(inventoryLedger).values({
            id: randomUUID(), tenantId, warehouseId, materialId, direction: "receive", quantity: qty, deltaQty: qty,
            referenceType: "stock_document", referenceId: document.id, note: document.note, actorUserId
          });
        }
        const [posted] = await tx.update(stockDocuments).set({
          status: "posted", postedAt: new Date(), postedByUserId: actorUserId,
          revision: sql`${stockDocuments.revision} + 1`, updatedAt: new Date()
        }).where(and(eq(stockDocuments.id, document.id), eq(stockDocuments.status, "draft"))).returning();
        openingDocument ??= mapStockDocument(posted);
      }

      const result = { materials, openingDocument };
      await saveBatchResult(result);
      return result;
    });
  }

  async listDealers(tenantId: string): Promise<Dealer[]> {
    return (await this.db.select().from(dealerOrganizations).where(eq(dealerOrganizations.tenantId, tenantId))
      .orderBy(desc(dealerOrganizations.updatedAt))).map(mapDealer);
  }

  async getDealerForOrganization(organizationId: string): Promise<Dealer | null> {
    const [row] = await this.db.select().from(dealerOrganizations)
      .where(eq(dealerOrganizations.organizationId, organizationId)).limit(1);
    return row ? mapDealer(row) : null;
  }

  async getPricingTenantId(organizationId: string): Promise<string> {
    const [organization] = await this.db.select({ parentOrganizationId: organizations.parentOrganizationId })
      .from(organizations).where(eq(organizations.id, organizationId)).limit(1);
    return organization?.parentOrganizationId ?? organizationId;
  }

  async getSalesPricingPreference(organizationId: string, userId: string): Promise<SalesPricingPreference | null> {
    const [row] = await this.db.select().from(salesPricingPreferences)
      .where(and(eq(salesPricingPreferences.organizationId, organizationId), eq(salesPricingPreferences.userId, userId)))
      .limit(1);
    return row ? {
      salesMultiplierBasisPoints: row.salesMultiplierBasisPoints,
      source: "user_default",
      updatedAt: iso(row.updatedAt)
    } : null;
  }

  async setSalesPricingPreference(organizationId: string, userId: string, salesMultiplierBasisPoints: number): Promise<SalesPricingPreference> {
    const [row] = await this.db.insert(salesPricingPreferences).values({
      id: randomUUID(), organizationId, userId, salesMultiplierBasisPoints
    }).onConflictDoUpdate({
      target: [salesPricingPreferences.organizationId, salesPricingPreferences.userId],
      set: { salesMultiplierBasisPoints, updatedAt: new Date() }
    }).returning();
    return {
      salesMultiplierBasisPoints: row.salesMultiplierBasisPoints,
      source: "user_default",
      updatedAt: iso(row.updatedAt)
    };
  }

  async createDealer(tenantId: string, input: CreateDealerInput): Promise<Dealer> {
    const row = await this.db.transaction(async (tx) => {
      const organizationId = randomUUID();
      const code = input.code || `DLR-CN-${organizationId.slice(0, 8).toUpperCase()}`;
      const slugBase = code.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "dealer";
      await tx.insert(organizations).values({
        id: organizationId, name: input.name, slug: `${slugBase}-${randomUUID().slice(0, 8)}`, plan: "dealer",
        organizationType: "dealer", parentOrganizationId: tenantId
      });
      await tx.insert(organizationEntitlements).values(DEALER_MODULES.map((module) => ({
        id: randomUUID(), organizationId, module, enabled: true, permissionAllowlist: null
      })));
      const [created] = await tx.insert(dealerOrganizations).values({
        id: randomUUID(), tenantId, organizationId, code, name: input.name,
        region: input.region, contact: input.contact, phone: input.phone, email: input.email ?? null,
        level: input.level ?? "standard",
        settlementRatePercent: input.settlementRatePercent ?? input.discountRate ?? 90,
        discountRate: input.settlementRatePercent ?? input.discountRate ?? 90
      }).returning();
      return created;
    });
    return mapDealer(row);
  }

  async ensureDealerAdmin(organizationId: string, userId: string, input: { name: string; phone: string; email?: string }): Promise<void> {
    const [member] = await this.db.select({ id: members.id }).from(members).where(and(
      eq(members.organizationId, organizationId), eq(members.userId, userId)
    )).limit(1);
    if (!member) throw new AppError(500, "INTERNAL_ERROR", "Dealer administrator membership was not created");
    await this.db.update(members).set({ role: "dealer_admin", status: "active", updatedAt: new Date() }).where(eq(members.id, member.id));
    await this.configureNewMemberAuthorization(member.id, organizationId, "dealer_admin", "dealer");
    await this.db.update(users).set({ mustChangePassword: true, updatedAt: new Date() }).where(eq(users.id, userId));
  }

  async updateDealerSettlementRate(tenantId: string, id: string, settlementRatePercent: number): Promise<Dealer> {
    const [row] = await this.db.update(dealerOrganizations).set({
      settlementRatePercent, discountRate: settlementRatePercent,
      revision: sql`${dealerOrganizations.revision} + 1`, updatedAt: new Date()
    }).where(and(eq(dealerOrganizations.tenantId, tenantId), eq(dealerOrganizations.id, id))).returning();
    if (!row) throw new AppError(404, "NOT_FOUND", "Dealer not found");
    return mapDealer(row);
  }

  async listAccounts(tenantId: string): Promise<AccountSummary[]> {
    const rows = await this.db.select({
      id: members.id, tenantId: members.organizationId, userId: users.id, name: users.name,
      email: users.email, phone: users.phoneNumber, role: members.role, status: members.status,
      createdAt: members.createdAt, updatedAt: members.updatedAt
    }).from(members).innerJoin(users, eq(members.userId, users.id))
      .where(and(eq(members.organizationId, tenantId), ne(users.role, "admin"))).orderBy(desc(members.updatedAt));
    return Promise.all(rows.map(async (row) => {
      const [active] = await this.db.select({ value: max(sessions.updatedAt) }).from(sessions)
        .where(eq(sessions.userId, row.userId));
      return mapAccount(row, active.value ?? null);
    }));
  }

  async createOrganizationAdmin(tenantId: string, userId: string, input: CreateOrganizationAdminInput): Promise<AccountSummary> {
    const [[organization], entitlements] = await Promise.all([
      this.db.select({ type: organizations.organizationType }).from(organizations).where(eq(organizations.id, tenantId)).limit(1),
      this.readEntitlements(tenantId)
    ]);
    if (!organization) throw new AppError(404, "NOT_FOUND", "Organization not found");
    if (!entitlements.some((item) => item.module === "accounts" && item.enabled)) {
      throw new AppError(409, "VALIDATION_ERROR", "The accounts module must be enabled before creating an organization administrator");
    }
    const [existing] = await this.db.select({ id: users.id }).from(users).where(or(
      eq(users.phoneNumber, input.phone),
      input.email ? eq(users.email, input.email) : undefined
    )).limit(1);
    if (existing && existing.id !== userId) throw new AppError(409, "IDEMPOTENCY_CONFLICT", "An account with this phone number or email already exists");
    const [member] = await this.db.select({ id: members.id }).from(members).where(and(
      eq(members.organizationId, tenantId), eq(members.userId, userId)
    )).limit(1);
    if (!member) throw new AppError(500, "INTERNAL_ERROR", "Organization administrator membership was not created");
    const organizationType = organization.type === "dealer" ? "dealer" as const : "hq" as const;
    const role: Role = organizationType === "dealer" ? "dealer_admin" : "headquarters_admin";
    await this.db.update(members).set({ role, status: "active", updatedAt: new Date() }).where(eq(members.id, member.id));
    await this.configureNewMemberAuthorization(member.id, tenantId, role, organizationType);
    await this.db.update(users).set({ mustChangePassword: true, updatedAt: new Date() }).where(eq(users.id, userId));
    const created = (await this.listAccounts(tenantId)).find((account) => account.userId === userId);
    if (!created) throw new AppError(500, "INTERNAL_ERROR", "Organization administrator account was not created");
    return created;
  }

  async updateAccountStatus(tenantId: string, id: string, status: AccountStatus): Promise<AccountSummary> {
    const [current] = await this.db.select({ status: members.status, globalRole: users.role }).from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .where(and(eq(members.organizationId, tenantId), eq(members.id, id))).limit(1);
    if (!current || current.globalRole === "admin") throw new AppError(404, "NOT_FOUND", "Account not found");
    if (current.status === "active" && status !== "active") await this.ensureActivePermissionAdministratorAfterDisable(tenantId, id);
    const [updated] = await this.db.update(members).set({ status, updatedAt: new Date() })
      .where(and(eq(members.organizationId, tenantId), eq(members.id, id))).returning();
    if (!updated) throw new AppError(404, "NOT_FOUND", "Account not found");
    const item = (await this.listAccounts(tenantId)).find((account) => account.id === id);
    if (!item) throw new AppError(404, "NOT_FOUND", "Account not found");
    return item;
  }

  private async ensureActivePermissionAdministratorAfterDisable(tenantId: string, disabledMemberId: string): Promise<void> {
    const [entitlements, activeMembers] = await Promise.all([
      this.readEntitlements(tenantId),
      this.db.select({
        id: members.id, role: members.role, permissionConfigured: members.permissionConfigured,
        organizationType: organizations.organizationType
      }).from(members).innerJoin(organizations, eq(members.organizationId, organizations.id))
        .where(and(eq(members.organizationId, tenantId), eq(members.status, "active")))
    ]);
    if (!entitlements.some((item) => item.module === "accounts" && item.enabled)) return;
    const candidates = activeMembers.filter((member) => member.id !== disabledMemberId);
    const candidateIds = candidates.map((member) => member.id);
    const grantRows = candidateIds.length
      ? await this.db.select().from(memberPermissionGrants).where(and(
        eq(memberPermissionGrants.organizationId, tenantId),
        inArray(memberPermissionGrants.memberId, candidateIds)
      ))
      : [];
    const grantsByMember = new Map<string, PermissionGrant[]>();
    for (const row of grantRows) {
      const grants = grantsByMember.get(row.memberId) ?? [];
      grants.push(...mapPermissionGrant(row));
      grantsByMember.set(row.memberId, grants);
    }
    for (const member of candidates) {
      const authorization = calculateAuthorization({
        role: normalizeRole(member.role),
        organizationType: member.organizationType,
        grants: member.permissionConfigured ? grantsByMember.get(member.id) ?? [] : undefined,
        entitlements
      });
      if (authorization.effectivePermissions.includes("account.manage") && authorization.effectivePermissions.includes("permission.delegate")) return;
    }
    throw new AppError(409, "VALIDATION_ERROR", "At least one active permission administrator is required");
  }

  async listEmployees(tenantId: string): Promise<Employee[]> {
    const accounts = await this.listAccounts(tenantId);
    return accounts.filter((account): account is Employee => account.role === "factory_employee");
  }

  async createEmployee(tenantId: string, userId: string, input: CreateEmployeeInput): Promise<Employee> {
    const [existing] = await this.db.select({ id: users.id }).from(users).where(or(
      eq(users.phoneNumber, input.phone),
      input.email ? eq(users.email, input.email) : undefined
    )).limit(1);
    if (existing && existing.id !== userId) throw new AppError(409, "IDEMPOTENCY_CONFLICT", "An account with this phone number or email already exists");
    const [member] = await this.db.select({ id: members.id }).from(members).where(and(
      eq(members.organizationId, tenantId), eq(members.userId, userId)
    )).limit(1);
    if (!member) throw new AppError(500, "INTERNAL_ERROR", "Employee membership was not created");
    await this.db.update(members).set({ role: "factory_employee", status: "active", updatedAt: new Date() })
      .where(eq(members.id, member.id));
    await this.configureNewMemberAuthorization(member.id, tenantId, "factory_employee", "hq", false);
    await this.db.update(users).set({ mustChangePassword: true, updatedAt: new Date() }).where(eq(users.id, userId));
    const created = (await this.listEmployees(tenantId)).find((employee) => employee.userId === userId);
    if (!created) throw new AppError(500, "INTERNAL_ERROR", "Employee account was not created");
    return created;
  }

  private async configureNewMemberAuthorization(
    memberId: string,
    organizationId: string,
    role: Role,
    organizationType: "hq" | "dealer",
    grantLegacyDefaults = true
  ): Promise<void> {
    const permissions = grantLegacyDefaults ? legacyPermissionsForRole(role, organizationType) : [];
    const scope = role === "factory_employee" ? "assigned" : "organization";
    await this.db.transaction(async (tx) => {
      await tx.delete(memberPermissionGrants).where(and(
        eq(memberPermissionGrants.organizationId, organizationId),
        eq(memberPermissionGrants.memberId, memberId)
      ));
      await tx.delete(memberDataScopes).where(and(
        eq(memberDataScopes.organizationId, organizationId),
        eq(memberDataScopes.memberId, memberId)
      ));
      if (permissions.length) await tx.insert(memberPermissionGrants).values(permissions.map((permission) => ({
        id: randomUUID(), organizationId, memberId, permission, scope, assignedUserIds: []
      })));
      if (grantLegacyDefaults && role === "factory_employee") await tx.insert(memberDataScopes).values({
        id: randomUUID(), organizationId, memberId, resource: "orders", scope: "assigned", assignedUserIds: []
      });
      await tx.update(members).set({ permissionConfigured: true, updatedAt: new Date() }).where(eq(members.id, memberId));
    });
  }

  async updateEmployeeStatus(tenantId: string, id: string, status: AccountStatus): Promise<Employee> {
    const account = await this.updateAccountStatus(tenantId, id, status);
    if (account.role !== "factory_employee") throw new AppError(404, "NOT_FOUND", "Employee not found");
    return { ...account, role: "factory_employee" };
  }

  async listEmployeeOrderSummaries(tenantId: string, employeeUserId?: string): Promise<EmployeeOrderSummary[]> {
    const employees = await this.listEmployees(tenantId);
    const scope = employeeUserId ? employees.filter((employee) => employee.userId === employeeUserId) : employees;
    if (!scope.length) return [];
    const ids = scope.map((employee) => employee.userId);
    const orderRows = await this.db.select().from(orders).where(and(eq(orders.tenantId, tenantId), inArray(orders.ownerUserId, ids)));
    const followUps = await this.db.select().from(orderFollowUps).where(and(eq(orderFollowUps.tenantId, tenantId), inArray(orderFollowUps.authorUserId, ids)));
    const statuses: OrderStatus[] = ["draft", "confirmed", "technical_review", "ready_for_production", "in_production", "ready_to_ship", "shipped", "delivered", "completed", "on_hold", "cancelled"];
    const stamp = new Date();
    return scope.map((employee) => {
      const employeeOrders = orderRows.filter((order) => order.ownerUserId === employee.userId);
      const employeeFollowUps = followUps.filter((item) => item.authorUserId === employee.userId);
      const latest = employeeFollowUps.map((item) => item.createdAt).sort((a, b) => a.getTime() - b.getTime()).at(-1) ?? null;
      return {
        employee,
        totalOrders: employeeOrders.length,
        totalAmountMinor: employeeOrders.filter((order) => order.status !== "cancelled").reduce((sum, order) => sum + order.totalMinor, 0),
        statusCounts: Object.fromEntries(statuses.map((status) => [status, employeeOrders.filter((order) => order.status === status).length])) as EmployeeOrderSummary["statusCounts"],
        pendingFollowUpCount: employeeFollowUps.filter((item) => item.nextFollowUpAt && item.nextFollowUpAt <= stamp).length,
        latestFollowUpAt: latest ? iso(latest) : null
      };
    });
  }

  async listEmployeeFollowUpSummaries(tenantId: string, employeeUserId?: string): Promise<EmployeeFollowUpSummary[]> {
    const employees = await this.listEmployees(tenantId);
    const scope = employeeUserId ? employees.filter((employee) => employee.userId === employeeUserId) : employees;
    if (!scope.length) return [];
    const ids = scope.map((employee) => employee.userId);
    const rows = await this.db.select().from(orderFollowUps).where(and(eq(orderFollowUps.tenantId, tenantId), inArray(orderFollowUps.authorUserId, ids)));
    const stamp = new Date();
    const today = stamp.toISOString().slice(0, 10);
    return scope.map((employee) => {
      const followUps = rows.filter((item) => item.authorUserId === employee.userId);
      const scheduled = followUps.filter((item) => item.nextFollowUpAt);
      const latest = followUps.map((item) => item.createdAt).sort((a, b) => a.getTime() - b.getTime()).at(-1) ?? null;
      return {
        employee,
        totalFollowUps: followUps.length,
        followedOrderCount: new Set(followUps.map((item) => item.orderId)).size,
        pendingNextFollowUpCount: followUps.filter((item) => item.nextFollowUpAt && item.nextFollowUpAt <= stamp).length,
        dueTodayCount: scheduled.filter((item) => iso(item.nextFollowUpAt!).slice(0, 10) === today).length,
        overdueCount: scheduled.filter((item) => iso(item.nextFollowUpAt!).slice(0, 10) < today).length,
        latestFollowUpAt: latest ? iso(latest) : null
      };
    });
  }

  async listPriceLists(tenantId: string): Promise<PriceList[]> {
    return (await this.db.select().from(priceLists).where(eq(priceLists.tenantId, tenantId))
      .orderBy(desc(priceLists.updatedAt))).map(mapPriceList);
  }

  async getPriceList(tenantId: string, id: string): Promise<PriceList | null> {
    const [row] = await this.db.select().from(priceLists).where(and(eq(priceLists.tenantId, tenantId), eq(priceLists.id, id))).limit(1);
    return row ? mapPriceList(row) : null;
  }

  async createPriceList(tenantId: string, input: CreatePriceListInput): Promise<PriceList> {
    const [row] = await this.db.insert(priceLists).values({
      id: randomUUID(), tenantId, code: input.code, name: input.name, market: input.market,
      currency: input.currency ?? "CNY", version: input.version, effectiveFrom: input.effectiveFrom
    }).returning();
    return mapPriceList(row);
  }

  async listPriceListItems(tenantId: string, priceListId: string): Promise<PriceListItem[]> {
    return (await this.db.select().from(priceListItems).where(and(
      eq(priceListItems.tenantId, tenantId), eq(priceListItems.priceListId, priceListId)
    )).orderBy(priceListItems.category, priceListItems.materialKey, priceListItems.specKey)).map(mapPriceListItem);
  }

  async savePriceListItems(tenantId: string, priceListId: string, inputs: SavePriceListItemInput[]): Promise<PriceListItem[]> {
    assertUniqueInputKeys(inputs);
    return this.db.transaction(async (tx) => {
      const [list] = await tx.select().from(priceLists).where(and(eq(priceLists.tenantId, tenantId), eq(priceLists.id, priceListId))).limit(1);
      if (!list) throw new AppError(404, "NOT_FOUND", "Price list not found");
      if (list.status !== "draft") throw new AppError(409, "INVALID_TRANSITION", "Only draft price lists can be edited");
      for (const input of inputs) {
        const values = {
          id: input.id ?? randomUUID(), tenantId, priceListId,
          materialKey: input.materialKey, specKey: input.specKey, category: input.category,
          name: input.name, specification: input.specification ?? "", unit: input.unit,
          pricingMethod: input.pricingMethod ?? "fixed",
          retailUnitPriceMinor: input.retailUnitPriceMinor ?? input.retailPriceMinor ?? null,
          pricingRule: input.pricingRule ?? input.rule ?? null,
          note: input.note ?? input.remark ?? "", sourceRef: input.sourceRef ?? input.materialCode ?? null,
          updatedAt: new Date()
        };
        await tx.insert(priceListItems).values(values).onConflictDoUpdate({
          target: [priceListItems.tenantId, priceListItems.priceListId, priceListItems.materialKey, priceListItems.specKey],
          set: { ...values, id: undefined, revision: sql`${priceListItems.revision} + 1` }
        });
      }
      const items = await tx.select().from(priceListItems).where(and(eq(priceListItems.tenantId, tenantId), eq(priceListItems.priceListId, priceListId)));
      await tx.update(priceLists).set({ itemCount: items.length, revision: list.revision + 1, updatedAt: new Date() })
        .where(and(eq(priceLists.tenantId, tenantId), eq(priceLists.id, priceListId)));
      return items.map(mapPriceListItem);
    });
  }

  async validatePriceList(tenantId: string, priceListId: string): Promise<PriceListValidation> {
    const list = await this.getPriceList(tenantId, priceListId);
    if (!list) throw new AppError(404, "NOT_FOUND", "Price list not found");
    return validateItems(await this.listPriceListItems(tenantId, priceListId));
  }

  async publishPriceList(tenantId: string, priceListId: string, userId: string, effectiveFrom?: string): Promise<PriceList> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(priceLists).where(and(eq(priceLists.tenantId, tenantId), eq(priceLists.id, priceListId))).limit(1);
      if (!current) throw new AppError(404, "NOT_FOUND", "Price list not found");
      if (current.status !== "draft") throw new AppError(409, "INVALID_TRANSITION", "Only draft price lists can be published");
      const items = (await tx.select().from(priceListItems).where(and(eq(priceListItems.tenantId, tenantId), eq(priceListItems.priceListId, priceListId)))).map(mapPriceListItem);
      const validation = validateItems(items);
      if (!validation.valid) throw new AppError(409, "VALIDATION_ERROR", "Price list validation failed", validation);
      const starts = effectiveFrom ?? current.effectiveFrom;
      const previousDay = new Date(`${starts}T00:00:00.000Z`);
      previousDay.setUTCDate(previousDay.getUTCDate() - 1);
      const effectiveTo = previousDay.toISOString().slice(0, 10);
      const previousStatus = effectiveTo < new Date().toISOString().slice(0, 10) ? "expired" as const : "active" as const;
      await tx.update(priceLists).set({ status: previousStatus, effectiveTo, updatedAt: new Date() }).where(and(
        eq(priceLists.tenantId, tenantId), eq(priceLists.market, current.market), eq(priceLists.currency, current.currency),
        eq(priceLists.status, "active")
      ));
      const stamp = new Date();
      const [published] = await tx.update(priceLists).set({
        effectiveFrom: starts, effectiveTo: null, status: "active", itemCount: items.length,
        publishedBy: userId, publishedAt: stamp, revision: current.revision + 1, updatedAt: stamp
      }).where(and(eq(priceLists.tenantId, tenantId), eq(priceLists.id, priceListId))).returning();
      return mapPriceList(published);
    });
  }

  async clonePriceList(tenantId: string, priceListId: string, input: ClonePriceListInput): Promise<PriceList> {
    const source = await this.getPriceList(tenantId, priceListId);
    if (!source) throw new AppError(404, "NOT_FOUND", "Price list not found");
    const cloned = await this.createPriceList(tenantId, {
      name: input.name ?? `${source.name} copy`, code: input.code ?? source.code,
      market: source.market, currency: source.currency,
      version: input.version ?? `${source.version}-copy-${Date.now()}`, effectiveFrom: input.effectiveFrom ?? source.effectiveFrom
    });
    const items = await this.listPriceListItems(tenantId, priceListId);
    await this.savePriceListItems(tenantId, cloned.id, items.map((item) => ({
      materialKey: item.materialKey, specKey: item.specKey, category: item.category, name: item.name,
      specification: item.specification, unit: item.unit, pricingMethod: item.pricingMethod,
      retailUnitPriceMinor: item.retailUnitPriceMinor, pricingRule: item.pricingRule, note: item.note, sourceRef: item.sourceRef
    })));
    return (await this.getPriceList(tenantId, cloned.id))!;
  }

  async getActivePriceList(tenantId: string, market: string, currency: string, at = new Date()): Promise<PriceList | null> {
    const date = at.toISOString().slice(0, 10);
    const [row] = await this.db.select().from(priceLists).where(and(
      eq(priceLists.tenantId, tenantId), eq(priceLists.market, market), eq(priceLists.currency, currency),
      eq(priceLists.status, "active"), lte(priceLists.effectiveFrom, date),
      or(isNull(priceLists.effectiveTo), gte(priceLists.effectiveTo, date))
    )).orderBy(desc(priceLists.effectiveFrom)).limit(1);
    return row ? mapPriceList(row) : null;
  }

  async getPublicPricingTenantId(market: string, currency: string, at = new Date()): Promise<string | null> {
    const date = at.toISOString().slice(0, 10);
    const [row] = await this.db.select({ tenantId: priceLists.tenantId }).from(priceLists).where(and(
      eq(priceLists.market, market), eq(priceLists.currency, currency), eq(priceLists.status, "active"),
      lte(priceLists.effectiveFrom, date), or(isNull(priceLists.effectiveTo), gte(priceLists.effectiveTo, date))
    )).orderBy(desc(priceLists.effectiveFrom)).limit(1);
    return row?.tenantId ?? null;
  }
  private async mapTemplate(row: typeof templates.$inferSelect): Promise<Template> {
    const [version] = await this.db.select().from(templateVersions)
      .where(and(eq(templateVersions.tenantId, row.tenantId), eq(templateVersions.templateId, row.id)))
      .orderBy(desc(templateVersions.version)).limit(1);
    return {
      ...row, latestVersion: version ? mapTemplateVersion(version) : null,
      createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt)
    };
  }

  async listCustomers(tenantId: string): Promise<Customer[]> {
    const rows = await this.db.select().from(customers).where(eq(customers.tenantId, tenantId)).orderBy(desc(customers.updatedAt));
    return rows.map(mapCustomer);
  }
  async getCustomer(tenantId: string, id: string): Promise<Customer | null> {
    const [row] = await this.db.select().from(customers).where(and(eq(customers.tenantId, tenantId), eq(customers.id, id))).limit(1);
    return row ? mapCustomer(row) : null;
  }
  async createCustomer(tenantId: string, userId: string, input: CreateCustomerInput): Promise<Customer> {
    const [row] = await this.db.insert(customers).values({
      id: randomUUID(), tenantId, createdByUserId: userId, code: code("CUS"), name: input.name,
      companyName: input.companyName, email: input.email, phone: input.phone, address: input.address
    }).returning();
    return mapCustomer(row);
  }
  async updateCustomer(tenantId: string, id: string, revision: number, input: Partial<Customer>): Promise<Customer> {
    const [row] = await this.db.update(customers).set({
      name: input.name, companyName: input.companyName, email: input.email, phone: input.phone,
      address: input.address, status: input.status, revision: revision + 1, updatedAt: new Date()
    }).where(and(eq(customers.tenantId, tenantId), eq(customers.id, id), eq(customers.revision, revision))).returning();
    if (!row) await this.conflict(customers, tenantId, id);
    return mapCustomer(row!);
  }

  async listProjects(tenantId: string, customerId?: string): Promise<Project[]> {
    const where = customerId ? and(eq(projects.tenantId, tenantId), eq(projects.customerId, customerId)) : eq(projects.tenantId, tenantId);
    return (await this.db.select().from(projects).where(where).orderBy(desc(projects.updatedAt))).map(mapProject);
  }
  async getProject(tenantId: string, id: string): Promise<Project | null> {
    const [row] = await this.db.select().from(projects).where(and(eq(projects.tenantId, tenantId), eq(projects.id, id))).limit(1);
    return row ? mapProject(row) : null;
  }
  async createProject(tenantId: string, userId: string, input: CreateProjectInput): Promise<Project> {
    const [row] = await this.db.insert(projects).values({
      id: randomUUID(), tenantId, createdByUserId: userId, code: code("PRJ"), customerId: input.customerId,
      name: input.name, ownerUserId: userId, description: input.description, targetDate: input.targetDate
    }).returning();
    return mapProject(row);
  }
  async updateProject(tenantId: string, id: string, revision: number, input: Partial<Project>): Promise<Project> {
    const [row] = await this.db.update(projects).set({
      customerId: input.customerId, name: input.name, status: input.status, ownerUserId: input.ownerUserId,
      description: input.description, targetDate: input.targetDate, revision: revision + 1, updatedAt: new Date()
    }).where(and(eq(projects.tenantId, tenantId), eq(projects.id, id), eq(projects.revision, revision))).returning();
    if (!row) await this.conflict(projects, tenantId, id);
    return mapProject(row!);
  }

  async listDesigns(tenantId: string, projectId?: string): Promise<Design[]> {
    const where = projectId ? and(eq(designs.tenantId, tenantId), eq(designs.projectId, projectId)) : eq(designs.tenantId, tenantId);
    return (await this.db.select().from(designs).where(where).orderBy(desc(designs.updatedAt))).map(mapDesign);
  }
  async getDesign(tenantId: string, id: string): Promise<Design | null> {
    const [row] = await this.db.select().from(designs).where(and(eq(designs.tenantId, tenantId), eq(designs.id, id))).limit(1);
    return row ? mapDesign(row) : null;
  }
  async createDesign(tenantId: string, userId: string, input: CreateDesignInput): Promise<Design> {
    const calculated = recalculateDesignSnapshot(input.configSnapshot);
    const [row] = await this.db.insert(designs).values({
      id: randomUUID(), tenantId, createdByUserId: userId, code: code("DSN"), projectId: input.projectId, name: input.name,
      templateVersionId: input.templateVersionId, ...calculated
    }).returning();
    return mapDesign(row);
  }
  async updateDesignDraft(
    tenantId: string, id: string, draftRevision: number,
    input: Pick<Design, "configSnapshot" | "bomSnapshot" | "pricingSnapshot"> & { name?: string }
  ): Promise<Design> {
    const calculated = recalculateDesignSnapshot(input.configSnapshot);
    const [row] = await this.db.update(designs).set({
      name: input.name, ...calculated, draftRevision: draftRevision + 1,
      revision: draftRevision + 1, updatedAt: new Date()
    }).where(and(eq(designs.tenantId, tenantId), eq(designs.id, id), eq(designs.draftRevision, draftRevision))).returning();
    if (!row) {
      const current = await this.getDesign(tenantId, id);
      if (!current) throw new AppError(404, "NOT_FOUND", "Design not found");
      throw new VersionConflictError(current.draftRevision);
    }
    return mapDesign(row);
  }
  async createDesignVersion(tenantId: string, designId: string, userId: string, note?: string): Promise<DesignVersion> {
    return this.db.transaction(async (tx) => {
      const [designRow] = await tx.select().from(designs).where(and(eq(designs.tenantId, tenantId), eq(designs.id, designId))).limit(1);
      if (!designRow) throw new AppError(404, "NOT_FOUND", "Design not found");
      const [current] = await tx.select({ value: max(designVersions.version) }).from(designVersions)
        .where(and(eq(designVersions.tenantId, tenantId), eq(designVersions.designId, designId)));
      const version = snapshotDesignDraft(mapDesign(designRow), {
        id: randomUUID(), version: (current.value ?? 0) + 1, createdBy: userId, createdAt: new Date().toISOString(), note
      });
      const [row] = await tx.insert(designVersions).values({ ...version, createdAt: new Date(version.createdAt) }).returning();
      return mapDesignVersion(row);
    });
  }
  async getDesignVersion(tenantId: string, id: string): Promise<DesignVersion | null> {
    const [row] = await this.db.select().from(designVersions).where(and(eq(designVersions.tenantId, tenantId), eq(designVersions.id, id))).limit(1);
    return row ? mapDesignVersion(row) : null;
  }

  async listQuotes(tenantId: string, projectId?: string): Promise<Quote[]> {
    const where = projectId ? and(eq(quotes.tenantId, tenantId), eq(quotes.projectId, projectId)) : eq(quotes.tenantId, tenantId);
    const rows = await this.db.select().from(quotes).where(where).orderBy(desc(quotes.updatedAt));
    return Promise.all(rows.map((row) => this.mapQuote(row)));
  }
  async getQuote(tenantId: string, id: string): Promise<Quote | null> {
    const [row] = await this.db.select().from(quotes).where(and(eq(quotes.tenantId, tenantId), eq(quotes.id, id))).limit(1);
    return row ? this.mapQuote(row) : null;
  }
  private async mapQuote(row: typeof quotes.$inferSelect): Promise<Quote> {
    const lines = await this.db.select().from(quoteLines)
      .where(and(eq(quoteLines.tenantId, row.tenantId), eq(quoteLines.quoteId, row.id)))
      .orderBy(quoteLines.position);
    return { ...row, lines: lines.map(mapQuoteLine), createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
  }
  async createQuote(tenantId: string, input: Omit<Quote, "id" | "tenantId" | "code" | "revision" | "createdAt" | "updatedAt">): Promise<Quote> {
    return this.db.transaction(async (tx) => {
      const id = randomUUID();
      const terms = (input.snapshot.quoteTerms ?? {}) as Record<string, unknown>;
      const [row] = await tx.insert(quotes).values({
        id, tenantId, createdByUserId: input.createdByUserId, code: code("QUO"), projectId: input.projectId, customerId: input.customerId,
        designVersionId: input.designVersionId, status: input.status, currency: input.currency,
        subtotalMinor: input.subtotalMinor, discountMinor: input.discountMinor,
        taxRateBasisPoints: Number(terms.taxRateBasisPoints ?? 0), taxMinor: input.taxMinor, totalMinor: input.totalMinor,
        basePriceTotalMinor: input.basePriceTotalMinor,
        salesMultiplierBasisPoints: input.salesMultiplierBasisPoints,
        multiplierQuoteTotalMinor: input.multiplierQuoteTotalMinor,
        validUntil: input.validUntil, notes: input.notes, snapshot: input.snapshot
      }).returning();
      if (input.lines.length) await tx.insert(quoteLines).values(input.lines.map((line, position) => ({
        ...line, tenantId, quoteId: id, position
      })));
      return { ...row, lines: input.lines, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
    });
  }
  async updateQuote(tenantId: string, id: string, revision: number, input: Partial<Quote>): Promise<Quote> {
    const terms = (input.snapshot?.quoteTerms ?? {}) as Record<string, unknown>;
    const [row] = await this.db.update(quotes).set({
      status: input.status, discountMinor: input.discountMinor,
      taxRateBasisPoints: input.snapshot ? Number(terms.taxRateBasisPoints ?? 0) : undefined,
      taxMinor: input.taxMinor, totalMinor: input.totalMinor, validUntil: input.validUntil,
      basePriceTotalMinor: input.basePriceTotalMinor,
      salesMultiplierBasisPoints: input.salesMultiplierBasisPoints,
      multiplierQuoteTotalMinor: input.multiplierQuoteTotalMinor,
      notes: input.notes, snapshot: input.snapshot, revision: revision + 1, updatedAt: new Date()
    }).where(and(eq(quotes.tenantId, tenantId), eq(quotes.id, id), eq(quotes.revision, revision))).returning();
    if (!row) await this.conflict(quotes, tenantId, id);
    return this.mapQuote(row!);
  }
  async transitionQuote(tenantId: string, id: string, revision: number, status: QuoteStatus): Promise<Quote> {
    return this.updateQuote(tenantId, id, revision, { status });
  }

  async listOrders(tenantId: string, projectId?: string, ownerUserId?: string): Promise<Order[]> {
    const predicates = [eq(orders.tenantId, tenantId)];
    if (projectId) predicates.push(eq(orders.projectId, projectId));
    if (ownerUserId) predicates.push(eq(orders.ownerUserId, ownerUserId));
    const where = and(...predicates);
    return (await this.db.select().from(orders).where(where).orderBy(desc(orders.updatedAt))).map(mapOrder);
  }
  async getOrder(tenantId: string, id: string, ownerUserId?: string): Promise<Order | null> {
    const predicates = [eq(orders.tenantId, tenantId), eq(orders.id, id)];
    if (ownerUserId) predicates.push(eq(orders.ownerUserId, ownerUserId));
    const [row] = await this.db.select().from(orders).where(and(...predicates)).limit(1);
    return row ? mapOrder(row) : null;
  }
  async createOrder(tenantId: string, input: Omit<Order, "id" | "tenantId" | "code" | "revision" | "createdAt" | "updatedAt">): Promise<Order> {
    const { assignedAt, customerConfirmedAt, ...orderInput } = input;
    const insertInput: typeof orders.$inferInsert = {
      ...orderInput,
      deliveryLeadTimeDays: orderInput.deliveryLeadTimeDays ?? 30,
      assignedAt: assignedAt ? new Date(assignedAt) : null,
      customerConfirmedAt: customerConfirmedAt ? new Date(customerConfirmedAt) : null,
      id: randomUUID(), tenantId, code: code("ORD")
    };
    const [row] = await this.db.insert(orders).values(insertInput).returning();
    return mapOrder(row);
  }
  async createOrderFromQuote(
    tenantId: string,
    quoteRevision: number,
    input: Omit<Order, "id" | "tenantId" | "code" | "revision" | "createdAt" | "updatedAt">
  ): Promise<{ order: Order; quote: Quote }> {
    const result = await this.db.transaction(async (tx) => {
      const { assignedAt, customerConfirmedAt, ...orderInput } = input;
      const [currentQuote] = await tx.select().from(quotes).where(and(
        eq(quotes.tenantId, tenantId), eq(quotes.id, input.acceptedQuoteId)
      )).limit(1);
      if (!currentQuote) throw new AppError(404, "NOT_FOUND", "Quote not found");
      if (currentQuote.revision !== quoteRevision) throw new VersionConflictError(currentQuote.revision);
      const [convertedQuote] = await tx.update(quotes).set({
        status: "converted", revision: quoteRevision + 1, updatedAt: new Date()
      }).where(and(eq(quotes.tenantId, tenantId), eq(quotes.id, currentQuote.id), eq(quotes.revision, quoteRevision))).returning();
      if (!convertedQuote) throw new VersionConflictError(currentQuote.revision);
      const insertInput: typeof orders.$inferInsert = {
        ...orderInput,
        deliveryLeadTimeDays: orderInput.deliveryLeadTimeDays ?? 30,
        assignedAt: assignedAt ? new Date(assignedAt) : null,
        customerConfirmedAt: customerConfirmedAt ? new Date(customerConfirmedAt) : null,
        id: randomUUID(), tenantId, code: code("ORD")
      };
      const [order] = await tx.insert(orders).values(insertInput).returning();
      return { order, quote: convertedQuote };
    });
    return { order: mapOrder(result.order), quote: await this.mapQuote(result.quote) };
  }
  async transitionOrder(tenantId: string, id: string, revision: number, status: OrderStatus, shippingNote?: string, actorUserId?: string): Promise<Order> {
    const row = await this.db.transaction(async (tx) => {
      const [updatedOrder] = await tx.update(orders).set({ status, shippingNote, revision: revision + 1, updatedAt: new Date() })
        .where(and(eq(orders.tenantId, tenantId), eq(orders.id, id), eq(orders.revision, revision))).returning();
      if (!updatedOrder) return null;
      if (status === "cancelled") {
        const rows = await tx.select().from(inventoryReservations).where(and(
          eq(inventoryReservations.tenantId, tenantId),
          eq(inventoryReservations.orderId, id),
          eq(inventoryReservations.status, "active")
        ));
        for (const reservation of rows) {
          const releasableQty = Math.max(0, reservation.qty - reservation.issuedQty - reservation.releasedQty);
          if (releasableQty > 0) {
            const [balance] = await tx.select().from(inventoryBalances).where(and(
              eq(inventoryBalances.tenantId, tenantId),
              eq(inventoryBalances.warehouseId, reservation.warehouseId),
              eq(inventoryBalances.materialId, reservation.materialId)
            )).limit(1);
            if (balance) {
              await tx.update(inventoryBalances).set({
                reservedQty: Math.max(0, balance.reservedQty - releasableQty),
                revision: sql`${inventoryBalances.revision} + 1`,
                updatedAt: new Date()
              }).where(eq(inventoryBalances.id, balance.id));
            }
            await tx.insert(inventoryLedger).values({
              id: randomUUID(), tenantId, warehouseId: reservation.warehouseId, materialId: reservation.materialId,
              direction: "release", quantity: releasableQty, deltaQty: 0, referenceType: "order", referenceId: id,
              note: "order reservation released on cancellation", actorUserId: actorUserId ?? null
            });
          }
          await tx.update(inventoryReservations).set({
            releasedQty: reservation.releasedQty + releasableQty,
            status: "released",
            revision: sql`${inventoryReservations.revision} + 1`,
            updatedAt: new Date()
          }).where(and(eq(inventoryReservations.id, reservation.id), eq(inventoryReservations.status, "active")));
        }
      }
      return updatedOrder;
    });
    if (!row) await this.conflict(orders, tenantId, id);
    return mapOrder(row!);
  }
  async updateOrderDeliverySchedule(
    tenantId: string,
    id: string,
    revision: number,
    input: { deliveryLeadTimeDays: number; customerConfirmedAt: string; expectedDeliveryDate: string }
  ): Promise<Order> {
    const [row] = await this.db.update(orders).set({
      customerConfirmedAt: new Date(input.customerConfirmedAt),
      deliveryLeadTimeDays: input.deliveryLeadTimeDays,
      expectedDeliveryDate: input.expectedDeliveryDate,
      revision: revision + 1,
      updatedAt: new Date()
    }).where(and(eq(orders.tenantId, tenantId), eq(orders.id, id), eq(orders.revision, revision))).returning();
    if (!row) await this.conflict(orders, tenantId, id);
    return mapOrder(row!);
  }

  async assignOrder(tenantId: string, id: string, input: AssignOrderInput, assignedByUserId: string): Promise<{ order: Order; assignment: OrderAssignment }> {
    if (input.ownerUserId) {
      const [account] = await this.db.select({ id: members.id }).from(members).where(and(
        eq(members.organizationId, tenantId),
        eq(members.userId, input.ownerUserId),
        eq(members.status, "active")
      )).limit(1);
      if (!account) throw new AppError(422, "VALIDATION_ERROR", "The assignee must be an active account in this organization");
    }
    const result = await this.db.transaction(async (tx) => {
      const [before] = await tx.select().from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.id, id))).limit(1);
      if (!before) throw new AppError(404, "NOT_FOUND", "Order not found");
      const stamp = new Date();
      const [updated] = await tx.update(orders).set({
        ownerUserId: input.ownerUserId,
        assignedAt: input.ownerUserId ? stamp : null,
        assignedByUserId,
        revision: before.revision + 1,
        updatedAt: stamp
      }).where(and(eq(orders.tenantId, tenantId), eq(orders.id, id), eq(orders.revision, before.revision))).returning();
      if (!updated) throw new VersionConflictError(before.revision);
      const [assignment] = await tx.insert(orderAssignments).values({
        id: randomUUID(), tenantId, orderId: id,
        previousOwnerUserId: before.ownerUserId,
        ownerUserId: input.ownerUserId,
        assignedByUserId
      }).returning();
      return { order: updated, assignment };
    });
    return { order: mapOrder(result.order), assignment: mapOrderAssignment(result.assignment) };
  }

  async listOrderFollowUps(tenantId: string, orderId: string): Promise<OrderFollowUp[]> {
    return (await this.db.select().from(orderFollowUps).where(and(
      eq(orderFollowUps.tenantId, tenantId), eq(orderFollowUps.orderId, orderId)
    )).orderBy(desc(orderFollowUps.createdAt))).map(mapOrderFollowUp);
  }

  async createOrderFollowUp(tenantId: string, orderId: string, authorUserId: string, input: CreateOrderFollowUpInput): Promise<OrderFollowUp> {
    const [row] = await this.db.insert(orderFollowUps).values({
      id: randomUUID(), tenantId, orderId, authorUserId, content: input.content,
      nextFollowUpAt: input.nextFollowUpAt ? new Date(input.nextFollowUpAt) : null
    }).returning();
    return mapOrderFollowUp(row);
  }

  async listShipments(tenantId: string, orderId?: string): Promise<Shipment[]> {
    const where = orderId
      ? and(eq(shipments.tenantId, tenantId), eq(shipments.orderId, orderId))
      : eq(shipments.tenantId, tenantId);
    return (await this.db.select().from(shipments).where(where).orderBy(desc(shipments.createdAt))).map(mapShipment);
  }

  async createShipment(tenantId: string, input: CreateShipmentInput): Promise<{ shipment: Shipment; order: Order }> {
    const result = await this.db.transaction(async (tx) => {
      const [currentOrder] = await tx.select().from(orders).where(and(
        eq(orders.tenantId, tenantId), eq(orders.id, input.orderId)
      )).limit(1);
      if (!currentOrder) throw new AppError(404, "NOT_FOUND", "Order not found");
      if (!["ready_to_ship", "shipped", "delivered", "completed"].includes(currentOrder.status)) {
        throw new AppError(409, "INVALID_TRANSITION", "The order is not ready to ship");
      }
      const stamp = input.shippedAt ? new Date(input.shippedAt) : new Date();
      const [shipment] = await tx.insert(shipments).values({
        id: randomUUID(), tenantId, orderId: input.orderId, shipmentNo: code("SHP"),
        carrier: input.carrier, trackingNo: input.trackingNo, status: "shipped",
        packages: input.packages, shippedAt: stamp
      }).returning();
      if (currentOrder.status !== "ready_to_ship") return { shipment, order: currentOrder };
      const [order] = await tx.update(orders).set({
        status: "shipped", revision: currentOrder.revision + 1, updatedAt: new Date()
      }).where(and(eq(orders.tenantId, tenantId), eq(orders.id, currentOrder.id), eq(orders.revision, currentOrder.revision))).returning();
      if (!order) throw new VersionConflictError(currentOrder.revision);
      return { shipment, order };
    });
    return { shipment: mapShipment(result.shipment), order: mapOrder(result.order) };
  }

  async listAttachments(tenantId: string, entityType?: string, entityId?: string): Promise<Attachment[]> {
    const filters = [eq(attachments.tenantId, tenantId)];
    if (entityType) filters.push(eq(attachments.entityType, entityType));
    if (entityId) filters.push(eq(attachments.entityId, entityId));
    return (await this.db.select().from(attachments).where(and(...filters))
      .orderBy(desc(attachments.createdAt))).map(mapAttachment);
  }

  async createAttachment(tenantId: string, userId: string, input: CreateAttachmentInput): Promise<Attachment> {
    const id = randomUUID();
    const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const [row] = await this.db.insert(attachments).values({
      id, tenantId, entityType: input.entityType, entityId: input.entityId,
      fileName: input.fileName, contentType: input.contentType, sizeBytes: input.sizeBytes,
      objectKey: `${tenantId}/${input.entityType}/${input.entityId}/${id}-${safeName}`,
      uploadPending: true, createdBy: userId, metadata: input.metadata ?? {}
    }).returning();
    return mapAttachment(row);
  }

  async recordAudit(input: AuditInput): Promise<AuditLog> {
    const [row] = await this.db.insert(auditLogs).values({ id: randomUUID(), ...input }).returning();
    return mapAudit(row);
  }
  async listAudit(tenantId: string, entityType?: string, entityId?: string): Promise<AuditLog[]> {
    const filters = [eq(auditLogs.tenantId, tenantId)];
    if (entityType) filters.push(eq(auditLogs.entityType, entityType));
    if (entityId) filters.push(eq(auditLogs.entityId, entityId));
    return (await this.db.select().from(auditLogs).where(and(...filters)).orderBy(desc(auditLogs.createdAt)).limit(500)).map(mapAudit);
  }
  async recordLoginLog(input: LoginLogInput): Promise<void> {
    await this.db.insert(loginLogs).values({
      id: randomUUID(), userId: input.userId, tenantId: input.tenantId,
      accountIdentifier: input.accountIdentifier ?? null, ipAddress: input.ipAddress ?? null, userAgent: input.userAgent ?? null
    });
  }
  async listLoginLogs(query: LoginLogQuery): Promise<{ items: LoginLogSummary[]; total: number }> {
    const filters = [];
    if (query.search?.trim()) {
      const pattern = `%${query.search.trim()}%`;
      filters.push(or(
        ilike(users.name, pattern), ilike(loginLogs.accountIdentifier, pattern), ilike(users.email, pattern),
        ilike(users.phoneNumber, pattern), ilike(users.username, pattern)
      ));
    }
    if (query.tenantId) filters.push(eq(loginLogs.tenantId, query.tenantId));
    if (query.start) filters.push(gte(loginLogs.createdAt, new Date(`${query.start}T00:00:00`)));
    if (query.end) filters.push(lte(loginLogs.createdAt, new Date(`${query.end}T23:59:59.999`)));
    const where = filters.length ? and(...filters) : undefined;
    const offset = (query.page - 1) * query.pageSize;
    const rows = await this.db.select({
      id: loginLogs.id, userId: loginLogs.userId, accountIdentifier: loginLogs.accountIdentifier,
      tenantId: loginLogs.tenantId, ipAddress: loginLogs.ipAddress, userAgent: loginLogs.userAgent, createdAt: loginLogs.createdAt,
      userName: users.name, userEmail: users.email, userPhone: users.phoneNumber, userUsername: users.username,
      tenantName: organizations.name
    }).from(loginLogs)
      .leftJoin(users, eq(users.id, loginLogs.userId))
      .leftJoin(organizations, eq(organizations.id, loginLogs.tenantId))
      .where(where)
      .orderBy(desc(loginLogs.createdAt), desc(loginLogs.id))
      .limit(query.pageSize).offset(offset);
    const [countRow] = await this.db.select({ total: sql<number>`count(*)::int` }).from(loginLogs)
      .leftJoin(users, eq(users.id, loginLogs.userId))
      .leftJoin(organizations, eq(organizations.id, loginLogs.tenantId))
      .where(where);
    return {
      items: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        userName: row.userName ?? row.userEmail ?? row.userId,
        accountIdentifier: row.accountIdentifier ?? row.userEmail ?? row.userPhone ?? row.userUsername,
        tenantId: row.tenantId,
        tenantName: row.tenantName,
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
        createdAt: iso(row.createdAt)
      })),
      total: countRow?.total ?? 0
    };
  }
  async getIdempotency(tenantId: string, route: string, key: string): Promise<IdempotencyRecord | null> {
    const [row] = await this.db.select().from(idempotencyKeys).where(and(
      eq(idempotencyKeys.tenantId, tenantId), eq(idempotencyKeys.route, route), eq(idempotencyKeys.key, key)
    )).limit(1);
    return row ? { tenantId, route, key, requestHash: row.requestHash, statusCode: row.statusCode, response: row.response } : null;
  }
  async saveIdempotency(record: IdempotencyRecord): Promise<void> {
    await this.db.insert(idempotencyKeys).values({
      id: randomUUID(), ...record, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    }).onConflictDoNothing();
  }
  async close(): Promise<void> {}

  private async conflict(table: typeof customers | typeof projects | typeof quotes | typeof orders, tenantId: string, id: string): Promise<never> {
    const [row] = await this.db.select({ revision: table.revision }).from(table as typeof customers)
      .where(and(eq(table.tenantId, tenantId), eq(table.id, id))).limit(1);
    if (!row) throw new AppError(404, "NOT_FOUND", "Resource not found");
    throw new VersionConflictError(row.revision);
  }
}

function normalizeRole(value: string): Role {
  const roles: Role[] = [
    "owner", "admin", "sales", "designer", "production", "finance", "member", "viewer",
    "headquarters_admin", "headquarters_sales", "headquarters_reviewer", "production_shipping",
    "dealer_admin", "dealer_designer_sales", "factory_employee"
  ];
  return roles.includes(value as Role) ? value as Role : "member";
}
function mapCustomer(row: typeof customers.$inferSelect): Customer { return { ...row, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) }; }
function mapProject(row: typeof projects.$inferSelect): Project { return { ...row, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) }; }
function mapDesign(row: typeof designs.$inferSelect): Design { return { ...row, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) }; }
function mapDesignVersion(row: typeof designVersions.$inferSelect): DesignVersion { return { ...row, createdAt: iso(row.createdAt) }; }
function mapTemplateVersion(row: typeof templateVersions.$inferSelect): TemplateVersion { return { ...row, createdAt: iso(row.createdAt), publishedAt: row.publishedAt ? iso(row.publishedAt) : null }; }
function mapQuoteLine(row: typeof quoteLines.$inferSelect): QuoteLine {
  return { id: row.id, sourceRef: row.sourceRef, description: row.description, quantity: row.quantity,
    unitPriceMinor: row.unitPriceMinor, lineTotalMinor: row.lineTotalMinor, pricingStatus: row.pricingStatus, metadata: row.metadata };
}
function mapOrder(row: typeof orders.$inferSelect): Order {
  return {
    ...row,
    customerConfirmedAt: row.customerConfirmedAt ? iso(row.customerConfirmedAt) : null,
    assignedAt: row.assignedAt ? iso(row.assignedAt) : null,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt)
  };
}
function mapOrderAssignment(row: typeof orderAssignments.$inferSelect): OrderAssignment {
  return { ...row, createdAt: iso(row.createdAt) };
}
function mapOrderFollowUp(row: typeof orderFollowUps.$inferSelect): OrderFollowUp {
  return {
    ...row,
    nextFollowUpAt: row.nextFollowUpAt ? iso(row.nextFollowUpAt) : null,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt)
  };
}
function mapDealer(row: typeof dealerOrganizations.$inferSelect): Dealer {
  return { ...row, settlementRatePercent: row.settlementRatePercent ?? row.discountRate,
    lastActiveAt: row.lastActiveAt ? iso(row.lastActiveAt) : null, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
}
function mapAccount(
  row: { id: string; tenantId: string; userId: string; name: string; email: string; phone: string | null; role: string; status: AccountStatus; createdAt: Date; updatedAt: Date },
  lastActiveAt: Date | null
): AccountSummary {
  return { ...row, email: isSystemLoginEmail(row.email) ? null : row.email, role: normalizeRole(row.role), lastActiveAt: lastActiveAt ? iso(lastActiveAt) : null,
    createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
}
function mapPriceList(row: typeof priceLists.$inferSelect): PriceList {
  return { ...row, publishedAt: row.publishedAt ? iso(row.publishedAt) : null, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
}
function mapPriceListItem(row: typeof priceListItems.$inferSelect): PriceListItem {
  return { ...row, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
}
function mapShipment(row: typeof shipments.$inferSelect): Shipment {
  return { ...row, shippedAt: row.shippedAt ? iso(row.shippedAt) : null, signedAt: row.signedAt ? iso(row.signedAt) : null,
    createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
}
function mapAttachment(row: typeof attachments.$inferSelect): Attachment {
  return { ...row, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
}
function mapAudit(row: typeof auditLogs.$inferSelect): AuditLog {
  return { ...row, before: row.before ?? null, after: row.after ?? null, createdAt: iso(row.createdAt) };
}

function mapWarehouse(row: typeof warehouses.$inferSelect): Warehouse {
  return { ...row, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
}
function mapMaterialVariant(row: typeof materialVariants.$inferSelect): MaterialVariant {
  return { ...row, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
}
function mapInventoryBalance(row: typeof inventoryBalances.$inferSelect): InventoryBalance {
  return { ...row, materialKey: "", specKey: "", color: "", finish: "", availableQty: row.onHandQty - row.reservedQty, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
}
function mapInventoryLedger(row: typeof inventoryLedger.$inferSelect): InventoryLedger {
  return { ...row, revision: 1, referenceId: row.referenceId ?? null, note: row.note ?? null, actorUserId: row.actorUserId ?? null, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
}
function mapStockDocument(row: typeof stockDocuments.$inferSelect): StockDocument {
  return { ...row, targetWarehouseId: row.targetWarehouseId ?? null, note: row.note ?? null, lines: row.lines as StockDocument["lines"], postedAt: row.postedAt ? iso(row.postedAt) : null, postedByUserId: row.postedByUserId ?? null, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
}
function mapInventoryReservation(row: typeof inventoryReservations.$inferSelect): InventoryReservation {
  return { ...row, status: row.status as InventoryReservation["status"], createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
}
function materialIdentity(value: { materialKey: string; specKey: string; color?: string; finish?: string }): string {
  return [value.materialKey, value.specKey, value.color ?? "", value.finish ?? ""].join("\u0000");
}

function mapPermissionGrant(row: typeof memberPermissionGrants.$inferSelect): PermissionGrant[] {
  if (!ALL_PERMISSIONS.includes(row.permission as Permission)) return [];
  const scope = ["own", "assigned", "specified", "organization"].includes(row.scope)
    ? row.scope as "own" | "assigned" | "specified" | "organization" : "organization";
  return [{ permission: row.permission as Permission, scope, assignedUserIds: row.assignedUserIds ?? [] }];
}

function mapResourceDataScope(row: typeof memberDataScopes.$inferSelect): ResourceDataScope[] {
  const scope = ["own", "assigned", "specified", "organization"].includes(row.scope)
    ? row.scope as "own" | "assigned" | "specified" | "organization" : "organization";
  return [{ resource: row.resource, scope, assignedUserIds: row.assignedUserIds ?? [] }];
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
  return { valid: errors.length === 0, errors, summary: {
    total: items.length, priced, unpriced: items.length - priced, formula,
    coveragePercent: items.length ? Math.round(priced / items.length * 10000) / 100 : 0
  } };
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
