import { createHash, randomUUID } from "node:crypto";
import {
  CreateAttachmentSchema,
  CreateCustomerSchema,
  CreateDealerSchema,
  CreateDesignSchema,
  CreateDesignVersionSchema,
  CreateEmployeeSchema,
  CreateOrganizationAdminSchema,
  CreateOrderSchema,
  CreateOrderFollowUpSchema,
  CreatePriceListSchema,
  CreateProjectSchema,
  CreateProjectQuoteSchema,
  CreateQuoteSchema,
  CreateShipmentSchema,
  CalculatePricingSchema,
  ClonePriceListSchema,
  CopyAccountAuthorizationSchema,
  AssignOrderSchema,
  OrderTransitionSchema,
  QuoteTransitionSchema,
  PublishPriceListSchema,
  PriceListImportCommitSchema,
  PriceListImportPreviewSchema,
  SavePriceListItemsSchema,
  UpdateAccountStatusSchema,
  ResetAccountPasswordSchema,
  ChangeOwnPasswordSchema,
  UpdateEmployeeStatusSchema,
  UpdateCustomerSchema,
  UpdateDesignDraftSchema,
  UpdateProjectSchema,
  UpdateQuoteSchema,
  UpdateDealerSettlementRateSchema,
  UpdateOrderDeliveryScheduleSchema,
  UpdateAccountAuthorizationSchema,
  UpdateOrganizationEntitlementsSchema,
  UpdateSalesPricingPreferenceSchema,
  CreateWarehouseSchema,
  CreateStockDocumentSchema,
  CreateInventoryReservationSchema,
  MaterialImportPreviewSchema,
  MaterialImportCommitSchema,
  type Design,
  type DesignVersion,
  type AccountAuthorization,
  type AuditLog,
  type Order,
  type Project,
  type Quote,
  type UpdateAccountAuthorizationInput,
  type PriceListImportRow
} from "@usm/contracts";
import {
  InvalidTransitionError,
  createOrderSnapshot,
  createQuoteSnapshot,
  recalculateQuote,
  transitionOrder,
  transitionQuote
} from "@usm/domain";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodType } from "zod";
import type { AuthService } from "./auth.js";
import { AppError, parseIfMatch, revisionEtag } from "./errors.js";
import { normalizePhoneNumber } from "./phone.js";
import type { Repository } from "./repository.js";
import { calculateAuthorization, dataScopeAllowsDelegation, hasPermission, getScope, permissionScopeResource, scopeAllowsRecord, scopeAllowsUser } from "./authorization.js";
import { buildCanonicalBom } from "./services/configurator.js";
import {
  ConfiguratorPriceCalculator,
  allocateDealerLineTotals,
  buildLegacyPriceCatalog,
  calculatePublishedPrice,
  toDealerPriceSource
} from "./services/price-calculator.js";
import {
  calculateExpectedDeliveryDate,
  DEFAULT_DELIVERY_LEAD_TIME_DAYS
} from "./services/delivery-schedule.js";
import { listInventoryShortages } from "./services/inventory-shortages.js";
import {
  createPortalCustomer,
  createPortalSession,
  findPortalBySlug,
  findPortalCustomer,
  getPortalConfig,
  getPortalSession,
  hashPortalSecret,
  listPortalDrafts,
  listPortalEvents,
  recordPortalEvent,
  savePortalDraft,
  updatePortalConfig
} from "./portal-store.js";

interface RouteDependencies {
  repository: Repository;
  auth: AuthService;
}

const EMPLOYEE_ORDER_TRANSITION_STATUSES = new Set(["confirmed", "technical_review", "ready_for_production", "on_hold"]);
const CHINA_MAINLAND = "\u4e2d\u56fd\u5927\u9646";
const DEFAULT_SALES_MULTIPLIER_BASIS_POINTS = 15_000;

function parse<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError(422, "VALIDATION_ERROR", "Request validation failed", result.error.issues);
  }
  return result.data;
}

function authContext(request: FastifyRequest) {
  if (!request.authContext) throw new AppError(401, "UNAUTHORIZED", "Authentication is required");
  return request.authContext;
}

function requirePermission(request: FastifyRequest, permission: import("@usm/contracts").Permission): void {
  const context = authContext(request);
  if (!hasPermission(context.authorization, permission)) throw new AppError(403, "FORBIDDEN", `Permission required: ${permission}`);
}

function requireAnyPermission(request: FastifyRequest, permissions: Array<import("@usm/contracts").Permission>): void {
  const context = authContext(request);
  if (!permissions.some((permission) => hasPermission(context.authorization, permission))) {
    throw new AppError(403, "FORBIDDEN", `One of these permissions is required: ${permissions.join(", ")}`);
  }
}

// Platform-level capabilities (e.g. login logs) are reserved for the super
// admin role and intentionally stay out of the delegable permission catalog.
function requirePlatformAdmin(request: FastifyRequest): void {
  if (authContext(request).principalType !== "platform_admin") {
    throw new AppError(403, "FORBIDDEN", "Platform administrator access is required");
  }
}

function requireMultiplierPermission(request: FastifyRequest, permission: "quotes.multiplier.view" | "quotes.multiplier.manage"): void {
  if (authContext(request).organizationType !== "hq") {
    throw new AppError(403, "FORBIDDEN", "Sales multiplier pricing is only available to headquarters organizations");
  }
  requirePermission(request, permission);
}

async function salesMultiplierForRequest(repository: Repository, request: FastifyRequest): Promise<number> {
  const context = authContext(request);
  if (context.organizationType !== "hq") return DEFAULT_SALES_MULTIPLIER_BASIS_POINTS;
  const preference = await repository.getSalesPricingPreference(context.tenant.id, context.user.id);
  return preference?.salesMultiplierBasisPoints ?? DEFAULT_SALES_MULTIPLIER_BASIS_POINTS;
}

function assertDealerDoesNotUseMultiplier(request: FastifyRequest, salesMultiplierBasisPoints: number | undefined): void {
  if (salesMultiplierBasisPoints !== undefined && authContext(request).organizationType === "dealer") {
    throw new AppError(403, "FORBIDDEN", "Dealer quotes cannot use sales multiplier pricing");
  }
}

function canonicalScopeResource(resource: string): string {
  if (resource === "account" || resource === "permission") return "accounts";
  if (resource === "dealer") return "dealers";
  return resource;
}

function sameStringSet(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function sameScope(left: { resource: string; scope: string; assignedUserIds: string[] } | undefined, right: { resource: string; scope: string; assignedUserIds: string[] }): boolean {
  if (!left) return false;
  return canonicalScopeResource(left.resource) === canonicalScopeResource(right.resource)
    && left.scope === right.scope
    && sameStringSet(left.assignedUserIds, right.assignedUserIds);
}

function assertDelegationInput(request: FastifyRequest, input: UpdateAccountAuthorizationInput, current?: AccountAuthorization): void {
  const { authorization } = authContext(request);
  const existingByPermission = new Map((current?.grants ?? []).map((grant) => [grant.permission, grant]));
  const unauthorized = input.grants
    .filter((grant) => {
      if (authorization.delegablePermissions.includes(grant.permission)) return false;
      const existing = existingByPermission.get(grant.permission);
      return !existing || existing.scope !== grant.scope || !sameStringSet(existing.assignedUserIds, grant.assignedUserIds);
    })
    .map((grant) => grant.permission);
  if (unauthorized.length) {
    throw new AppError(403, "FORBIDDEN", "You cannot grant permissions outside your delegation scope", unauthorized);
  }

  const requestedScopes = new Map(input.dataScopes.map((scope) => [scope.resource, scope]));
  const existingScopes = Object.values(current?.dataScopes ?? {});
  const scopes = [
    ...input.dataScopes,
    ...input.grants.map((grant) => {
      const resource = permissionScopeResource(grant.permission);
      return requestedScopes.get(resource) ?? { resource, scope: grant.scope, assignedUserIds: grant.assignedUserIds };
    })
  ];
  for (const requested of scopes) {
    const unchangedExistingScope = existingScopes.some((scope) => sameScope(scope, requested));
    const unchangedBlockedGrantScope = input.grants.some((grant) => {
      if (authorization.delegablePermissions.includes(grant.permission)) return false;
      const existing = existingByPermission.get(grant.permission);
      if (!existing) return false;
      return canonicalScopeResource(permissionScopeResource(grant.permission)) === canonicalScopeResource(requested.resource)
        && existing.scope === grant.scope
        && sameStringSet(existing.assignedUserIds, grant.assignedUserIds);
    });
    if (!unchangedExistingScope && !unchangedBlockedGrantScope && !dataScopeAllowsDelegation(authorization, requested.resource, requested)) {
      throw new AppError(403, "FORBIDDEN", "You cannot grant a broader data scope than your own", requested);
    }
  }
}

function assertAccountAuthorizationAccess(request: FastifyRequest, account: { userId: string }, label = "Account authorization"): void {
  const { user, authorization } = authContext(request);
  if (!scopeAllowsUser(getScope(authorization, "accounts"), user.id, account.userId)) {
    throw new AppError(404, "NOT_FOUND", `${label} not found`);
  }
}

const ACCOUNT_ROLE_RANK: Record<string, number> = {
  owner: 80,
  admin: 80,
  headquarters_admin: 80,
  dealer_admin: 60,
  headquarters_sales: 40,
  headquarters_reviewer: 40,
  production_shipping: 30,
  dealer_designer_sales: 30,
  factory_employee: 20,
  production: 20,
  finance: 20,
  sales: 20,
  designer: 20,
  member: 10,
  viewer: 10
};

function assertPasswordResetAccess(request: FastifyRequest, target: { userId: string; role: string }): void {
  const context = authContext(request);
  if (target.userId === context.user.id) throw new AppError(403, "FORBIDDEN", "Use self-service password change for your own account");
  if (context.principalType === "platform_admin") return;
  const actorRank = ACCOUNT_ROLE_RANK[context.role] ?? 0;
  const targetRank = ACCOUNT_ROLE_RANK[target.role] ?? 0;
  if (actorRank <= targetRank) throw new AppError(403, "FORBIDDEN", "Only a higher-level administrator can reset this password");
}

interface ReportSelection {
  employeeUserId?: string;
  allowedUserIds?: Set<string>;
}

function resolveReportSelection(request: FastifyRequest, employeeId?: string): ReportSelection {
  const context = authContext(request);
  if (employeeId) {
    if (employeeId === context.user.id) {
      if (
        !hasPermission(context.authorization, "reports.personal.view")
        && !hasPermission(context.authorization, "reports.assigned.view")
        && !hasPermission(context.authorization, "reports.organization.view")
      ) {
        throw new AppError(403, "FORBIDDEN", "Permission required: reports.personal.view");
      }
      return { employeeUserId: employeeId };
    }
    if (hasPermission(context.authorization, "reports.organization.view")) return { employeeUserId: employeeId };
    requirePermission(request, "reports.assigned.view");
    const scope = getScope(context.authorization, "reports", "own");
    if (!scopeAllowsUser(scope, context.user.id, employeeId)) {
      throw new AppError(404, "NOT_FOUND", "Report scope not found");
    }
    return { employeeUserId: employeeId };
  }

  if (hasPermission(context.authorization, "reports.organization.view")) return {};
  if (hasPermission(context.authorization, "reports.assigned.view")) {
    const scope = getScope(context.authorization, "reports", "own");
    if (scope.scope === "organization") return {};
    return {
      allowedUserIds: new Set([
        context.user.id,
        ...(scope.scope === "specified" ? scope.assignedUserIds : [])
      ])
    };
  }
  if (hasPermission(context.authorization, "reports.personal.view")) {
    return { employeeUserId: context.user.id };
  }
  throw new AppError(403, "FORBIDDEN", "Permission required: reports.personal.view");
}

function filterReportItems<T extends { employee: { userId: string } }>(selection: ReportSelection, items: T[]): T[] {
  if (!selection.allowedUserIds) return items;
  return items.filter((item) => selection.allowedUserIds!.has(item.employee.userId));
}

function hasOrganizationOrderStatusAccess(request: FastifyRequest): boolean {
  const context = authContext(request);
  const scope = getScope(context.authorization, "orders");
  return scope.scope === "organization" || hasPermission(context.authorization, "fulfillment.production.update");
}

function scopedItems<T>(
  request: FastifyRequest,
  resource: string,
  items: T[],
  ownership: (item: T) => { createdByUserId?: string | null; assignedUserId?: string | null }
): T[] {
  const context = authContext(request);
  const scope = getScope(context.authorization, resource);
  if (scope.scope === "organization") return items;
  return items.filter((item) => scopeAllowsRecord(scope, context.user.id, ownership(item)));
}

async function foundOrder(repository: Repository, request: FastifyRequest, id: string): Promise<Order> {
  const { tenant, user, authorization } = authContext(request);
  const item = await found(repository.getOrder(tenant.id, id), "Order");
  if (!scopeAllowsRecord(getScope(authorization, "orders"), user.id, {
    createdByUserId: item.createdByUserId,
    assignedUserId: item.ownerUserId
  })) throw new AppError(404, "NOT_FOUND", "Order not found");
  return item;
}

async function orderMaterialRequirements(repository: Repository, request: FastifyRequest, order: Order): Promise<Array<Record<string, unknown>>> {
  const { tenant, authorization } = authContext(request);
  const snapshot = isJsonRecord(order.snapshot) ? order.snapshot : {};
  const quote = isJsonRecord(snapshot.quote) ? snapshot.quote : {};
  const quoteSnapshot = isJsonRecord(quote.snapshot) ? quote.snapshot : {};
  const designVersion = isJsonRecord(quoteSnapshot.designVersion) ? quoteSnapshot.designVersion : {};
  const bom = Array.isArray(designVersion.bomSnapshot)
    ? designVersion.bomSnapshot
    : isJsonRecord(quoteSnapshot.calculation) && Array.isArray(quoteSnapshot.calculation.lines) ? quoteSnapshot.calculation.lines : [];
  const [materials, balances, reservations] = await Promise.all([
    repository.listMaterials(tenant.id),
    repository.listInventoryBalances(tenant.id),
    repository.listInventoryReservations(tenant.id, order.id)
  ]);
  const grouped = new Map<string, { material: typeof materials[number] | null; materialKey: string; specKey: string; color: string; finish: string; name: string; unit: string; requiredQty: number }>();
  for (const raw of bom) {
    if (!isJsonRecord(raw)) continue;
    const materialKey = String(raw.materialKey ?? raw.materialCode ?? raw.sourceRef ?? raw.name ?? "").trim();
    const specKey = String(raw.specKey ?? raw.spec ?? raw.specification ?? "standard").trim();
    const color = String(raw.color ?? "").trim();
    const finish = String(raw.finish ?? "").trim();
    const qty = Math.max(0, Math.round(Number(raw.qty ?? raw.quantity ?? 0)));
    if (!materialKey || qty <= 0) continue;
    const key = [materialKey, specKey, color, finish].join("\u0000");
    const material = materials.find((candidate) => [candidate.materialKey, candidate.specKey, candidate.color, candidate.finish].join("\u0000") === key) ?? null;
    const current = grouped.get(key) ?? { material, materialKey, specKey, color, finish, name: String(raw.name ?? material?.name ?? materialKey), unit: String(raw.unit ?? material?.unit ?? "pcs"), requiredQty: 0 };
    current.requiredQty += qty;
    grouped.set(key, current);
  }
  const quantityVisible = hasPermission(authorization, "inventory.quantity.view");
  return [...grouped.values()].map((item, index) => {
    const materialId = item.material?.id ?? null;
    const relatedReservations = materialId ? reservations.filter((reservation) => reservation.materialId === materialId) : [];
    const issuedQty = relatedReservations.reduce((sum, reservation) => sum + reservation.issuedQty, 0);
    const reservedQty = relatedReservations.reduce((sum, reservation) => sum + Math.max(0, reservation.qty - reservation.issuedQty - reservation.releasedQty), 0);
    const availableQty = materialId ? balances.filter((balance) => balance.materialId === materialId).reduce((sum, balance) => sum + balance.availableQty, 0) : 0;
    const status = issuedQty >= item.requiredQty ? "issued" : reservedQty >= item.requiredQty - issuedQty ? "reserved" : availableQty >= item.requiredQty - issuedQty ? "unreserved" : "shortage";
    return {
      id: materialId ?? `requirement-${index + 1}`, orderId: order.id, materialId,
      materialKey: item.materialKey, specKey: item.specKey, color: item.color || null, finish: item.finish || null,
      materialCode: item.material?.materialCode ?? item.materialKey, name: item.name, specification: item.material?.specification ?? item.specKey, unit: item.unit,
      requiredQty: quantityVisible ? item.requiredQty : 0, reservedQty: quantityVisible ? reservedQty : 0, issuedQty: quantityVisible ? issuedQty : 0,
      availableQty: quantityVisible ? availableQty : null, status
    };
  });
}

function reservationInput(orderId: string, body: unknown): Record<string, unknown> {
  const raw = isJsonRecord(body) ? body : {};
  const source = Array.isArray(raw.requirements) ? raw.requirements : Array.isArray(raw.lines) ? raw.lines : [];
  return {
    orderId,
    warehouseId: raw.warehouseId && raw.warehouseId !== "default" ? raw.warehouseId : undefined,
    requirements: source.map((line) => {
      const value = isJsonRecord(line) ? line : {};
      return {
        materialId: typeof value.materialId === "string" ? value.materialId : undefined,
        materialKey: String(value.materialKey ?? value.materialCode ?? ""),
        specKey: String(value.specKey ?? value.spec ?? "standard"),
        color: typeof value.color === "string" ? value.color : undefined,
        finish: typeof value.finish === "string" ? value.finish : undefined,
        qty: Math.max(1, Math.round(Number(value.qty ?? value.quantity ?? 0)))
      };
    })
  };
}

async function orderReservationRequirements(repository: Repository, tenantId: string, order: Order) {
  const snapshot = isJsonRecord(order.snapshot) ? order.snapshot : {};
  const quote = isJsonRecord(snapshot.quote) ? snapshot.quote : {};
  const quoteSnapshot = isJsonRecord(quote.snapshot) ? quote.snapshot : {};
  const designVersion = isJsonRecord(quoteSnapshot.designVersion) ? quoteSnapshot.designVersion : {};
  const bom = Array.isArray(designVersion.bomSnapshot)
    ? designVersion.bomSnapshot
    : isJsonRecord(quoteSnapshot.calculation) && Array.isArray(quoteSnapshot.calculation.lines) ? quoteSnapshot.calculation.lines : [];
  const grouped = new Map<string, { materialKey: string; specKey: string; color?: string; finish?: string; qty: number }>();
  for (const raw of bom) {
    if (!isJsonRecord(raw)) continue;
    const materialKey = String(raw.materialKey ?? raw.materialCode ?? raw.sourceRef ?? raw.name ?? "").trim();
    const specKey = String(raw.specKey ?? raw.spec ?? raw.specification ?? "standard").trim();
    const color = String(raw.color ?? "").trim();
    const finish = String(raw.finish ?? "").trim();
    const qty = Math.max(0, Math.round(Number(raw.qty ?? raw.quantity ?? 0)));
    if (!materialKey || qty <= 0) continue;
    const key = [materialKey, specKey, color, finish].join("\u0000");
    const current = grouped.get(key) ?? { materialKey, specKey, color: color || undefined, finish: finish || undefined, qty: 0 };
    current.qty += qty;
    grouped.set(key, current);
  }
  return [...grouped.values()];
}

async function foundProject(repository: Repository, request: FastifyRequest, id: string): Promise<Project> {
  const { tenant, user, authorization } = authContext(request);
  const item = await found(repository.getProject(tenant.id, id), "Project");
  if (!scopeAllowsRecord(getScope(authorization, "projects"), user.id, {
    createdByUserId: item.createdByUserId,
    assignedUserId: item.ownerUserId
  })) {
    throw new AppError(404, "NOT_FOUND", "Project not found");
  }
  return item;
}

async function foundQuote(repository: Repository, request: FastifyRequest, id: string): Promise<Quote> {
  const { tenant, user, authorization } = authContext(request);
  const item = await found(repository.getQuote(tenant.id, id), "Quote");
  const project = await repository.getProject(tenant.id, item.projectId);
  if (!scopeAllowsRecord(getScope(authorization, "quotes"), user.id, {
    createdByUserId: item.createdByUserId,
    assignedUserId: project?.ownerUserId
  })) {
    throw new AppError(404, "NOT_FOUND", "Quote not found");
  }
  return item;
}

async function foundDesign(repository: Repository, request: FastifyRequest, id: string): Promise<Design> {
  const { tenant, user, authorization } = authContext(request);
  const item = await found(repository.getDesign(tenant.id, id), "Design");
  const project = await repository.getProject(tenant.id, item.projectId);
  if (!scopeAllowsRecord(getScope(authorization, "designs"), user.id, {
    createdByUserId: item.createdByUserId,
    assignedUserId: project?.ownerUserId
  })) {
    throw new AppError(404, "NOT_FOUND", "Design not found");
  }
  return item;
}

async function visibleCustomers(repository: Repository, request: FastifyRequest, items: import("@usm/contracts").Customer[]): Promise<import("@usm/contracts").Customer[]> {
  const { tenant, user, authorization } = authContext(request);
  const scope = getScope(authorization, "customers");
  if (scope.scope === "organization") return items;
  const projects = await repository.listProjects(tenant.id);
  const allowedUserIds = new Set([user.id, ...(scope.scope === "specified" ? scope.assignedUserIds : [])]);
  const assignedCustomerIds = new Set(projects
    .filter((project) => allowedUserIds.has(project.ownerUserId ?? ""))
    .map((project) => project.customerId)
    .filter((id): id is string => Boolean(id)));
  if (scope.scope === "assigned") return items.filter((customer) => assignedCustomerIds.has(customer.id));
  if (scope.scope === "own") return items.filter((customer) => customer.createdByUserId === user.id);
  return items.filter((customer) => allowedUserIds.has(customer.createdByUserId ?? "") || assignedCustomerIds.has(customer.id));
}

async function assertAttachmentParentAccess(repository: Repository, request: FastifyRequest, entityType: string, entityId: string): Promise<void> {
  const { tenant, user, authorization } = authContext(request);
  if (entityType === "order") {
    await foundOrder(repository, request, entityId);
    return;
  }
  if (entityType === "project") {
    await foundProject(repository, request, entityId);
    return;
  }
  if (entityType === "quote") {
    await foundQuote(repository, request, entityId);
    return;
  }
  if (entityType === "design") {
    const design = await found(repository.getDesign(tenant.id, entityId), "Design");
    const project = await repository.getProject(tenant.id, design.projectId);
    if (!scopeAllowsRecord(getScope(authorization, "designs"), user.id, {
      createdByUserId: design.createdByUserId,
      assignedUserId: project?.ownerUserId
    })) {
      throw new AppError(404, "NOT_FOUND", "Design not found");
    }
    return;
  }
  if (entityType === "customer") {
    const customer = await found(repository.getCustomer(tenant.id, entityId), "Customer");
    if (!(await visibleCustomers(repository, request, [customer])).length) throw new AppError(404, "NOT_FOUND", "Customer not found");
    return;
  }
  throw new AppError(404, "NOT_FOUND", "Attachment parent not found");
}

async function canAccessAttachment(repository: Repository, request: FastifyRequest, entityType: string, entityId: string): Promise<boolean> {
  try {
    await assertAttachmentParentAccess(repository, request, entityType, entityId);
    return true;
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 404) return false;
    throw error;
  }
}

function inferredCustomerConfirmedAt(order: Order): string | null {
  if (order.customerConfirmedAt) return order.customerConfirmedAt;
  const snapshot = isJsonRecord(order.snapshot) ? order.snapshot : {};
  const quote = isJsonRecord(snapshot.quote) ? snapshot.quote : {};
  const candidate = quote.customerConfirmedAt ?? quote.updatedAt ?? snapshot.acceptedAt ?? order.createdAt;
  return typeof candidate === "string" && candidate ? candidate : null;
}

function withOrderDeliverySchedule(order: Order): Order {
  const customerConfirmedAt = inferredCustomerConfirmedAt(order);
  const deliveryLeadTimeDays = order.deliveryLeadTimeDays ?? DEFAULT_DELIVERY_LEAD_TIME_DAYS;
  const expectedDeliveryDate = order.expectedDeliveryDate
    ?? (customerConfirmedAt ? calculateExpectedDeliveryDate(customerConfirmedAt, deliveryLeadTimeDays) : null);
  return { ...order, customerConfirmedAt, deliveryLeadTimeDays, expectedDeliveryDate };
}

type DisplayQuote = Quote & {
  customerName: string | null;
  projectName: string | null;
  ownerName: string | null;
};
type DisplayOrder = Order & {
  customerName: string | null;
  projectName: string | null;
  ownerName: string | null;
};
type DisplayFollowUp = { authorName: string | null };
type DisplayProject = Project & {
  customerName: string | null;
  ownerName: string | null;
  quoteTotalMinor: number | null;
  quoteCurrency: string | null;
  suggestedRetailTotalMinor: number | null;
  quoteSource: "quote" | "manual" | "suggested_retail" | null;
  quoteId: string | null;
  quoteRevision: number | null;
  quoteStatus: Quote["status"] | null;
  quoteEditable: boolean;
  quoteNote: string | null;
  dealerTotalMinor: number | null;
  basePriceTotalMinor: number | null;
  salesMultiplierBasisPoints: number | null;
  multiplierQuoteTotalMinor: number | null;
};

type PriceFieldPolicy = ReturnType<typeof authContext>["authorization"]["fieldPolicy"];

const PRICE_CONTAINER_KEYS = new Set(["calculation", "pricelist", "dealerpricing", "pricingsnapshot"]);
const PRICE_SOURCE_KEYS = new Set(["sourceid", "sourcetitle", "dealername", "settlementratepercent"]);

function normalizedPriceKey(key: string): string {
  return key.replaceAll("_", "").replaceAll("-", "").toLowerCase();
}

function isSensitivePriceValueKey(key: string): boolean {
  const normalized = normalizedPriceKey(key);
  if (PRICE_SOURCE_KEYS.has(normalized) || normalized === "salesmultiplierbasispoints") return true;
  return /(?:unitprice|lineprice|retailprice|dealerprice|purchaseprice|referencecost|subtotal|discount|tax|total|amount)(?:minor)?$/.test(normalized)
    || normalized === "price";
}

function scrubPriceData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubPriceData);
  if (!isJsonRecord(value)) return value;
  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    const normalized = normalizedPriceKey(key);
    if (PRICE_CONTAINER_KEYS.has(normalized) || isSensitivePriceValueKey(key)) continue;
    result[key] = scrubPriceData(nested);
  }
  return result;
}

function finiteMinor(value: unknown): number | null {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount) : null;
}

function dealerPricingFromQuote(quote: Quote): Record<string, unknown> | null {
  const snapshot = isJsonRecord(quote.snapshot) ? quote.snapshot : {};
  return isJsonRecord(snapshot.dealerPricing) ? snapshot.dealerPricing : null;
}

function dealerPricingFromOrder(order: Order): Record<string, unknown> | null {
  const snapshot = isJsonRecord(order.snapshot) ? order.snapshot : {};
  const quote = isJsonRecord(snapshot.quote) ? snapshot.quote : null;
  const quoteSnapshot = quote && isJsonRecord(quote.snapshot) ? quote.snapshot : null;
  if (quoteSnapshot && isJsonRecord(quoteSnapshot.dealerPricing)) return quoteSnapshot.dealerPricing;
  return quote && isJsonRecord(quote.dealerPricing) ? quote.dealerPricing : null;
}

function maskProjectForAuthorization<T extends DisplayProject>(project: T, policy: ReturnType<typeof authContext>["authorization"]["fieldPolicy"]): T {
  const { dealerTotalMinor: _dealerTotalMinor, ...visibleProject } = project;
  if (policy.price === "none") {
    return {
      ...visibleProject,
      quoteTotalMinor: null,
      suggestedRetailTotalMinor: null,
      basePriceTotalMinor: null,
      salesMultiplierBasisPoints: null,
      multiplierQuoteTotalMinor: null
    } as T;
  }
  if (policy.price !== "dealer_only") return visibleProject as T;
  return {
    ...visibleProject,
    quoteTotalMinor: project.dealerTotalMinor,
    suggestedRetailTotalMinor: null,
    basePriceTotalMinor: null,
    salesMultiplierBasisPoints: null,
    multiplierQuoteTotalMinor: null
  } as T;
}

function maskQuoteForAuthorization<T extends Quote>(quote: T, policy: PriceFieldPolicy): T {
  if (policy.price !== "dealer_only" && policy.price !== "none") return quote;
  const snapshot = scrubPriceData(quote.snapshot) as Record<string, unknown>;
  if (policy.price === "none") {
    const lines = quote.lines.map((line) => ({ ...line, unitPriceMinor: null, lineTotalMinor: null, metadata: scrubPriceData(line.metadata) as Record<string, unknown> }));
    return {
      ...quote,
      subtotalMinor: null,
      discountMinor: null,
      taxMinor: null,
      totalMinor: null,
      basePriceTotalMinor: null,
      salesMultiplierBasisPoints: null,
      multiplierQuoteTotalMinor: null,
      lines,
      snapshot
    } as unknown as T;
  }
  const dealerPricing = dealerPricingFromQuote(quote);
  const dealerTotal = finiteMinor(dealerPricing?.purchaseTotalMinor);
  const dealerLines = Array.isArray(dealerPricing?.lines) ? dealerPricing.lines : [];
  const byLine = new Map(dealerLines.map((line) => {
    const item = isJsonRecord(line) ? line : {};
    return [String(item.quoteLineId ?? ""), finiteMinor(item.dealerLineTotalMinor) ?? null] as const;
  }));
  const lines = quote.lines.map((line) => {
    const lineTotalMinor = byLine.get(line.id) ?? null;
    const unitPriceMinor = lineTotalMinor === null || line.quantity <= 0 ? null : Math.round(lineTotalMinor / line.quantity);
    return { ...line, unitPriceMinor, lineTotalMinor, metadata: {} };
  });
  return {
    ...quote,
    subtotalMinor: dealerTotal,
    discountMinor: null,
    taxMinor: null,
    totalMinor: dealerTotal,
    basePriceTotalMinor: null,
    salesMultiplierBasisPoints: null,
    multiplierQuoteTotalMinor: null,
    lines,
    snapshot
  } as unknown as T;
}

function maskOrderForAuthorization<T extends Order>(order: T, policy: PriceFieldPolicy): T {
  if (policy.price !== "dealer_only" && policy.price !== "none") return order;
  const snapshot = scrubPriceData(order.snapshot) as Record<string, unknown>;
  if (policy.price === "none") return { ...order, totalMinor: null, snapshot } as unknown as T;
  return { ...order, totalMinor: finiteMinor(dealerPricingFromOrder(order)?.purchaseTotalMinor), snapshot } as unknown as T;
}

function maskDesignForAuthorization<T extends Design>(design: T, policy: PriceFieldPolicy): T {
  if (policy.price !== "dealer_only" && policy.price !== "none") return design;
  return {
    ...design,
    bomSnapshot: (scrubPriceData(design.bomSnapshot) as Array<Record<string, unknown>>),
    pricingSnapshot: {}
  } as T;
}

function maskDesignVersionForAuthorization<T extends DesignVersion>(version: T, policy: PriceFieldPolicy): T {
  if (policy.price !== "dealer_only" && policy.price !== "none") return version;
  return { ...version, bomSnapshot: scrubPriceData(version.bomSnapshot), pricingSnapshot: {} } as T;
}

function maskPricingResult<T extends Record<string, unknown>>(result: T, policy: PriceFieldPolicy): T {
  if (policy.price !== "dealer_only" && policy.price !== "none") return result;
  const cloned = structuredClone(result) as Record<string, unknown>;
  const dealer = isJsonRecord(cloned.dealer) ? cloned.dealer : null;
  const dealerTotal = policy.price === "dealer_only" ? finiteMinor(dealer?.purchaseTotalMinor) : null;
  delete cloned.retailTotalMinor;
  delete cloned.priceList;
  delete cloned.dealer;
  if (Array.isArray(cloned.lines)) {
    cloned.lines = cloned.lines.map((line) => {
      if (!isJsonRecord(line)) return line;
      const next = { ...line };
      const dealerLineTotal = policy.price === "dealer_only" ? finiteMinor(next.dealerLineTotalMinor) : null;
      delete next.lineTotalMinor;
      delete next.unitPriceMinor;
      delete next.dealerLineTotalMinor;
      next.totalMinor = dealerLineTotal;
      return next;
    });
  }
  for (const key of Object.keys(cloned)) {
    if (isSensitivePriceValueKey(key)) delete cloned[key];
  }
  if (policy.price === "dealer_only") cloned.totalMinor = dealerTotal;
  return cloned as T;
}

function hasMaterialCostInput(value: unknown): boolean {
  const root = isJsonRecord(value) ? value : {};
  const rows = [root.materialRows, root.rows].flatMap((candidate) => Array.isArray(candidate) ? candidate : []);
  return rows.some((row) => isJsonRecord(row) && (Object.hasOwn(row, "referenceCost") || Object.hasOwn(row, "referenceCostMinor")));
}

function scrubMaterialCosts<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => scrubMaterialCosts(item)) as T;
  if (!isJsonRecord(value)) return value;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (["referenceCost", "referenceCostMinor", "reference_cost", "reference_cost_minor"].includes(key)) continue;
    next[key] = scrubMaterialCosts(child);
  }
  return next as T;
}

async function accountNames(repository: Repository, tenantId: string): Promise<Map<string, string>> {
  return new Map((await repository.listAccounts(tenantId)).map((account) => [account.userId, account.name]));
}

async function withVisibleAuditActors(
  repository: Repository,
  context: ReturnType<typeof authContext>,
  items: AuditLog[],
  names: Map<string, string>
): Promise<Array<AuditLog & { actorName: string | null }>> {
  return Promise.all(items.map(async (item) => {
    const platformActor = item.actorUserId
      ? (await repository.getUserSecurityState(item.actorUserId)).globalRole === "admin"
      : false;
    const visiblePlatformActor = context.principalType === "platform_admin";
    return {
      ...withoutInlinePreviewData(item),
      actorUserId: platformActor && !visiblePlatformActor ? null : item.actorUserId,
      actorName: platformActor
        ? visiblePlatformActor ? "平台管理员" : "系统操作"
        : item.actorUserId ? names.get(item.actorUserId) ?? null : null
    };
  }));
}

const PLATFORM_USER_REFERENCE_FIELDS = ["createdByUserId", "ownerUserId", "assignedByUserId", "adjustedByUserId"];

async function redactPlatformUserReferences<T extends object>(
  repository: Repository,
  context: ReturnType<typeof authContext>,
  item: T
): Promise<T> {
  if (context.principalType === "platform_admin") return item;
  const visible = { ...item } as Record<string, unknown>;
  const referencedUserIds = [...new Set(PLATFORM_USER_REFERENCE_FIELDS
    .map((field) => visible[field])
    .filter((value): value is string => typeof value === "string" && value.length > 0))];
  const securityStates = await Promise.all(referencedUserIds.map(async (userId) => [
    userId,
    await repository.getUserSecurityState(userId)
  ] as const));
  const platformUserIds = new Set(securityStates
    .filter(([, state]) => state.globalRole === "admin")
    .map(([userId]) => userId));
  for (const field of PLATFORM_USER_REFERENCE_FIELDS) {
    if (typeof visible[field] === "string" && platformUserIds.has(visible[field])) visible[field] = null;
  }
  return visible as T;
}

function withPlatformOwnerName<T extends { ownerUserId?: string | null; ownerName?: string | null }>(
  context: ReturnType<typeof authContext>,
  item: T
): T {
  if (context.principalType === "platform_admin" && item.ownerUserId === context.user.id) {
    return { ...item, ownerName: context.user.name };
  }
  return item;
}

interface OrderDisplayRelations {
  customerNames: Map<string, string>;
  projects: Map<string, Project>;
  accountNames: Map<string, string>;
}

async function orderDisplayRelations(repository: Repository, tenantId: string): Promise<OrderDisplayRelations> {
  const [customers, projects, accounts] = await Promise.all([
    repository.listCustomers(tenantId),
    repository.listProjects(tenantId),
    repository.listAccounts(tenantId)
  ]);
  return {
    customerNames: new Map(customers.map((customer) => [customer.id, customer.name])),
    projects: new Map(projects.map((project) => [project.id, project])),
    accountNames: new Map(accounts.map((account) => [account.userId, account.name]))
  };
}

function relatedCustomerName(customerId: string | null, project: Project | undefined, relations: OrderDisplayRelations): string | null {
  const resolvedCustomerId = customerId ?? project?.customerId ?? null;
  return resolvedCustomerId ? relations.customerNames.get(resolvedCustomerId) ?? null : null;
}

function withQuoteDisplayNames(quote: Quote, relations: OrderDisplayRelations): DisplayQuote {
  const project = relations.projects.get(quote.projectId);
  return {
    ...quote,
    customerName: relatedCustomerName(quote.customerId, project, relations),
    projectName: project?.name ?? null,
    ownerName: project?.ownerUserId ? relations.accountNames.get(project.ownerUserId) ?? null : null
  };
}

function withOrderDisplayNames(order: Order, relations: OrderDisplayRelations): DisplayOrder {
  const scheduledOrder = withOrderDeliverySchedule(order);
  const project = relations.projects.get(scheduledOrder.projectId);
  return {
    ...scheduledOrder,
    customerName: relatedCustomerName(scheduledOrder.customerId, project, relations),
    projectName: project?.name ?? null,
    ownerName: scheduledOrder.ownerUserId ? relations.accountNames.get(scheduledOrder.ownerUserId) ?? null : null
  };
}

function isEditableQuote(quote: Quote): boolean {
  return quote.status === "draft" || quote.status === "priced";
}

function suggestedRetailFromQuote(quote: Quote): number {
  const terms = isJsonRecord(quote.snapshot.quoteTerms) ? quote.snapshot.quoteTerms : {};
  const suggested = Number(terms.suggestedRetailTotalMinor);
  if (Number.isInteger(suggested) && suggested >= 0) return suggested;
  const calculation = isJsonRecord(quote.snapshot.calculation) ? quote.snapshot.calculation : {};
  const calculated = Number(calculation.suggestedRetailTotalMinor ?? calculation.totalMinor);
  return Number.isInteger(calculated) && calculated >= 0 ? calculated : quote.totalMinor;
}

interface MultiplierQuoteTerms {
  basePriceTotalMinor: number;
  salesMultiplierBasisPoints: number;
  multiplierQuoteTotalMinor: number;
  finalQuoteTotalMinor: number;
  adjustmentMinor: number;
  adjustmentReason: string | null;
}

function createMultiplierQuoteTerms(
  basePriceTotalMinor: number,
  salesMultiplierBasisPoints: number,
  manualTotalMinor: number | undefined,
  adjustmentReason: string | undefined
): MultiplierQuoteTerms {
  const multiplierQuoteTotalMinor = Math.round(basePriceTotalMinor * salesMultiplierBasisPoints / 10_000);
  const finalQuoteTotalMinor = manualTotalMinor ?? multiplierQuoteTotalMinor;
  if (finalQuoteTotalMinor !== multiplierQuoteTotalMinor && !adjustmentReason) {
    throw new AppError(422, "VALIDATION_ERROR", "Adjustment reason is required when final quote differs from the multiplier quote", [{
      path: ["adjustmentReason"],
      message: "Adjustment reason is required when final quote differs from the multiplier quote"
    }]);
  }
  return {
    basePriceTotalMinor,
    salesMultiplierBasisPoints,
    multiplierQuoteTotalMinor,
    finalQuoteTotalMinor,
    adjustmentMinor: finalQuoteTotalMinor - multiplierQuoteTotalMinor,
    adjustmentReason: finalQuoteTotalMinor === multiplierQuoteTotalMinor ? null : adjustmentReason ?? null
  };
}

function quoteHasMultiplierTerms(quote: Quote): boolean {
  return quote.basePriceTotalMinor !== null
    && quote.salesMultiplierBasisPoints !== null
    && quote.multiplierQuoteTotalMinor !== null;
}

async function withProjectCustomerNames(repository: Repository, tenantId: string, projects: Project[]): Promise<DisplayProject[]> {
  const [customers, accounts, quotes, designs, pricingTenantId] = await Promise.all([
    repository.listCustomers(tenantId),
    repository.listAccounts(tenantId),
    repository.listQuotes(tenantId),
    repository.listDesigns(tenantId),
    repository.getPricingTenantId(tenantId)
  ]);
  const customerNames = new Map(customers.map((customer) => [customer.id, customer.name]));
  const ownerNames = new Map(accounts.map((account) => [account.userId, account.name]));
  const quotesByProject = new Map<string, Quote>();
  for (const quote of quotes) {
    if (["rejected", "expired", "cancelled"].includes(quote.status)) continue;
    const current = quotesByProject.get(quote.projectId);
    if (!current || quote.updatedAt > current.updatedAt || (quote.updatedAt === current.updatedAt && quote.revision > current.revision)) {
      quotesByProject.set(quote.projectId, quote);
    }
  }
  const designsByProject = new Map<string, Design>();
  for (const design of designs) {
    if (design.status === "archived") continue;
    const current = designsByProject.get(design.projectId);
    if (!current || design.updatedAt > current.updatedAt || (design.updatedAt === current.updatedAt && design.revision > current.revision)) {
      designsByProject.set(design.projectId, design);
    }
  }
  return Promise.all(projects.map(async (project) => {
    const quote = quotesByProject.get(project.id) ?? null;
    let suggestedRetailTotalMinor = quote ? suggestedRetailFromQuote(quote) : null;
    if (!quote) {
      const design = designsByProject.get(project.id);
      if (design) {
        const pricing = await calculatePublishedPrice({
          repository,
          pricingTenantId,
          organizationId: tenantId,
          market: CHINA_MAINLAND,
          currency: "CNY",
          bom: design.bomSnapshot
        });
        suggestedRetailTotalMinor = pricing.status === "priced" ? pricing.retailTotalMinor : null;
      }
    }
    const quoteTerms = quote && isJsonRecord(quote.snapshot.quoteTerms) ? quote.snapshot.quoteTerms : {};
    const manual = quoteTerms.pricingAuthority === "manual";
    const dealerTotalMinor = quote ? finiteMinor(dealerPricingFromQuote(quote)?.purchaseTotalMinor) : null;
    return {
      ...project,
      customerName: project.customerId ? customerNames.get(project.customerId) ?? null : null,
      ownerName: project.ownerUserId ? ownerNames.get(project.ownerUserId) ?? null : null,
      quoteTotalMinor: quote?.totalMinor ?? null,
      quoteCurrency: quote?.currency ?? (suggestedRetailTotalMinor === null ? null : "CNY"),
      suggestedRetailTotalMinor,
      quoteSource: quote ? (manual ? "manual" : "quote") : (suggestedRetailTotalMinor === null ? null : "suggested_retail"),
      quoteId: quote?.id ?? null,
      quoteRevision: quote?.revision ?? null,
      quoteStatus: quote?.status ?? null,
      quoteEditable: quote ? isEditableQuote(quote) : suggestedRetailTotalMinor !== null,
      quoteNote: quote?.notes ?? null,
      dealerTotalMinor,
      basePriceTotalMinor: quote?.basePriceTotalMinor ?? (quote ? null : suggestedRetailTotalMinor),
      salesMultiplierBasisPoints: quote?.salesMultiplierBasisPoints ?? (quote ? null : suggestedRetailTotalMinor === null ? null : DEFAULT_SALES_MULTIPLIER_BASIS_POINTS),
      multiplierQuoteTotalMinor: quote?.multiplierQuoteTotalMinor ?? (quote || suggestedRetailTotalMinor === null
        ? null
        : Math.round(suggestedRetailTotalMinor * DEFAULT_SALES_MULTIPLIER_BASIS_POINTS / 10_000))
    };
  }));
}

function withFollowUpAuthorName<T extends { authorUserId: string }>(item: T, names: Map<string, string>): T & DisplayFollowUp {
  return { ...item, authorName: names.get(item.authorUserId) ?? null };
}

function routeKey(request: FastifyRequest): string {
  return `${request.method}:${request.routeOptions.url}`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

type NormalizedPriceImportRow = {
  materialKey: string;
  specKey: string;
  price: number | undefined;
  materialCode?: string;
  name?: string;
  specification?: string;
  unit?: string;
  pricingMethod?: import("@usm/contracts").PriceListItem["pricingMethod"];
  pricingRule?: Record<string, unknown> | string | null;
  note?: string;
  rowNumber: number;
};

function normalizePriceImportRow(row: PriceListImportRow, rowNumber: number): NormalizedPriceImportRow {
  const materialKey = String(row.materialKey ?? row.canonicalName ?? "").trim();
  const specKey = normalizePriceImportSpecKey(row.specKey ?? row.spec ?? "");
  const rawPrice = row.retailUnitPrice ?? row.unitPrice;
  const price = rawPrice === undefined || rawPrice === null || rawPrice === "" ? undefined : Number(rawPrice);
  return {
    materialKey,
    specKey,
    price,
    materialCode: row.materialCode,
    name: row.name,
    specification: row.specification ?? row.spec,
    unit: row.unit,
    pricingMethod: row.pricingMethod,
    pricingRule: row.pricingRule,
    note: row.note,
    rowNumber
  };
}

function priceImportIdentity(materialKey: string, specKey: string): string {
  return `${materialKey.trim().toLocaleLowerCase()}|${normalizePriceImportSpecKey(specKey)}`;
}

function normalizePriceImportSpecKey(value: unknown): string {
  const text = String(value ?? "").normalize("NFKC").trim().toLocaleLowerCase();
  if (!text || ["standard", "通用", "标准", "无规格"].includes(text)) return "standard";
  return text
    .replace(/毫米/g, "mm")
    .replace(/\s*[x×*]\s*/g, "x")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9.\-\u4e00-\u9fff]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .replace(/-?mm$/, "") || "standard";
}

function priceImportPreviewToken(priceListId: string, revision: number, rows: PriceListImportRow[]): string {
  return createHash("sha256").update(canonicalJson({ priceListId, revision, rows })).digest("hex");
}

function priceImportRule(value: Record<string, unknown> | string | null | undefined): Record<string, unknown> | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === "string" ? { expression: value } : value;
}

function hasPriceImportRule(value: Record<string, unknown> | string | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return Object.keys(value).length > 0;
}

function samePriceImportRule(current: Record<string, unknown> | null | undefined, incoming: Record<string, unknown> | string | null | undefined): boolean {
  if (incoming === undefined) return true;
  return JSON.stringify(current ?? null) === JSON.stringify(priceImportRule(incoming) ?? null);
}

function buildPriceImportPreview(
  rows: PriceListImportRow[],
  existing: import("@usm/contracts").PriceListItem[]
): {
  rows: Array<{ rowNumber: number; identity: string; outcome: "new" | "updated" | "skipped" | "conflict" | "error"; message: string; input: PriceListImportRow }>;
  counts: { new: number; updated: number; skipped: number; conflict: number; error: number };
  errors: string[];
} {
  const counts = { new: 0, updated: 0, skipped: 0, conflict: 0, error: 0 };
  const seen = new Set<string>();
  const existingByKey = new Map(existing.map((item) => [priceImportIdentity(item.materialKey, item.specKey), item]));
  const previewRows = rows.map((input, index) => {
    const normalized = normalizePriceImportRow(input, input.sourceRow ?? index + 2);
    const identity = priceImportIdentity(normalized.materialKey, normalized.specKey);
    let outcome: "new" | "updated" | "skipped" | "conflict" | "error";
    let message: string;
    const current = existingByKey.get(identity);
    if (!normalized.materialKey || !normalized.specKey) {
      outcome = "error";
      message = "materialKey/canonicalName and specKey/spec are required";
    } else if ((normalized.price === undefined && !hasPriceImportRule(normalized.pricingRule)) || (normalized.price !== undefined && (!Number.isFinite(normalized.price) || normalized.price < 0))) {
      outcome = "error";
      message = "unitPrice/retailUnitPrice must be a non-negative number";
    } else if (seen.has(identity)) {
      outcome = "conflict";
      message = "Duplicate materialKey/specKey in import";
    } else if (!current) {
      outcome = "error";
      message = "Unknown material/spec; import does not create new price items";
    } else if (["included", "composite"].includes(current.pricingMethod)) {
      outcome = "skipped";
      message = "Included/composite items are not directly priced";
    } else if ((normalized.price === undefined || current.retailUnitPriceMinor === Math.round(normalized.price * 100)) && samePriceImportRule(current.pricingRule, normalized.pricingRule)) {
      outcome = "skipped";
      message = "No effective change";
    } else {
      outcome = "updated";
      message = "Existing item will be updated";
    }
    seen.add(identity);
    counts[outcome] += 1;
    return { rowNumber: normalized.rowNumber, identity, outcome, message, input };
  });
  return {
    rows: previewRows,
    counts,
    errors: previewRows.filter((row) => row.outcome === "error" || row.outcome === "conflict").map((row) => `Row ${row.rowNumber}: ${row.message}`)
  };
}

function withoutInlinePreviewData<T>(value: T): T {
  const cloned = structuredClone(value);
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!isJsonRecord(node)) return;
    delete node.previewDataUrl;
    Object.values(node).forEach(visit);
  };
  visit(cloned);
  return cloned;
}

async function idempotent<T>(
  request: FastifyRequest,
  reply: FastifyReply,
  repository: Repository,
  statusCode: number,
  operation: () => Promise<T>,
  required = false
): Promise<T | undefined> {
  const keyHeader = request.headers["idempotency-key"];
  const key = Array.isArray(keyHeader) ? keyHeader[0] : keyHeader;
  if (!key) {
    if (required) throw new AppError(428, "PRECONDITION_REQUIRED", "Idempotency-Key is required");
    return operation();
  }
  if (key.length > 200) throw new AppError(400, "BAD_REQUEST", "Idempotency-Key is too long");

  const { tenant } = authContext(request);
  const route = routeKey(request);
  const requestHash = createHash("sha256").update(canonicalJson(request.body)).digest("hex");
  const existing = await repository.getIdempotency(tenant.id, route, key);
  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw new AppError(409, "IDEMPOTENCY_CONFLICT", "This idempotency key was used with another payload");
    }
    reply.code(existing.statusCode).header("Idempotency-Replayed", "true").send(existing.response);
    return undefined;
  }

  const response = await operation();
  await repository.saveIdempotency({ tenantId: tenant.id, route, key, requestHash, statusCode, response });
  return response;
}

async function auditMutation(
  repository: Repository,
  request: FastifyRequest,
  action: string,
  entityType: string,
  entityId: string,
  before: unknown,
  after: unknown,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const auth = authContext(request);
  await repository.recordAudit({
    tenantId: auth.tenant.id,
    actorUserId: auth.user.id,
    action,
    entityType,
    entityId,
    requestId: request.id,
    before: withoutInlinePreviewData(before ?? null) as Record<string, unknown> | null,
    after: withoutInlinePreviewData(after ?? null) as Record<string, unknown> | null,
    metadata
  });
}

export async function registerApiRoutes(app: FastifyInstance, deps: RouteDependencies): Promise<void> {
  const { repository, auth } = deps;

  app.addHook("preHandler", async (request) => {
    const path = request.url.split("?")[0];
    if (!path.startsWith("/api") || path === "/api/health" || path.startsWith("/api/auth/") || path.startsWith("/api/portal/")) return;
    const identity = await auth.getIdentity(request.headers);
    if (!identity) {
      if (path === "/api/session" || path === "/api/pricing/calculate") return;
      throw new AppError(401, "UNAUTHORIZED", "Authentication is required");
    }
    const tenantHeader = request.headers["x-tenant-id"];
    const requestedTenantId = (Array.isArray(tenantHeader) ? tenantHeader[0] : tenantHeader) ?? identity.activeTenantId;
    const securityState = await repository.getUserSecurityState(identity.user.id);
    const membership = await repository.resolveMembership(identity.user.id, requestedTenantId);
    if (!membership) throw new AppError(403, "FORBIDDEN", "No organization membership is available");
    const principalType = securityState.globalRole === "admin" || identity.globalRole === "admin" ? "platform_admin" as const : "organization_member" as const;
    const mustChangePassword = securityState.mustChangePassword || identity.mustChangePassword === true;
    const passwordExempt = path === "/api/session" || path === "/api/me/change-password";
    if (mustChangePassword && !passwordExempt) throw new AppError(409, "PASSWORD_CHANGE_REQUIRED", "Password change is required before continuing");
    let authorizationTenantId = membership.tenant.id;
    let authorization = await repository.getAuthorization(identity.user.id, membership.tenant.id, membership.role);
    if (membership.delegatedFromTenantId && principalType !== "platform_admin") {
      authorizationTenantId = membership.delegatedFromTenantId;
      const sourceAuthorization = await repository.getAuthorization(identity.user.id, authorizationTenantId, membership.role);
      const dealerScope = sourceAuthorization.dataScopes.dealers;
      if (
        !hasPermission(sourceAuthorization, "dealer.workspace.access")
        || !dealerScope
        || !scopeAllowsUser(dealerScope, identity.user.id, membership.tenant.id)
      ) {
        throw new AppError(403, "FORBIDDEN", "Dealer workspace access is not authorized");
      }
      authorization = calculateAuthorization({
        role: membership.role,
        organizationType: "dealer",
        grants: sourceAuthorization.effectivePermissions.map((permission) => {
          const scope = getScope(sourceAuthorization, permission.split(".")[0]);
          return { permission, scope: scope.scope, assignedUserIds: scope.assignedUserIds };
        }),
        dataScopes: Object.values(sourceAuthorization.dataScopes),
        entitlements: await repository.listOrganizationEntitlements(membership.tenant.id)
      });
    }
    request.authContext = {
      user: identity.user, tenant: membership.tenant, role: membership.role,
      principalType,
      organizationType: membership.organizationType ?? "hq",
      authorizationTenantId,
      authorization,
      mustChangePassword
    };
  });

  // Record a login log entry for every successful ERP account sign-in. The
  // write runs in the background: awaiting inside an onSend hook stalls the
  // sign-in reply (the auth handler resolves right after reply.send). Only
  // failures of the log write are logged — never fail the sign-in itself.
  app.addHook("onSend", async (request, reply, payload) => {
    const path = request.url.split("?")[0];
    if (!/^\/api\/auth\/sign-in\/(email|username|phone-number)$/.test(path) || reply.statusCode !== 200) return payload;
    try {
      let parsed: unknown = payload;
      if (Buffer.isBuffer(payload) || typeof payload === "string") parsed = JSON.parse(String(payload));
      const userId = (parsed as { user?: { id?: unknown } } | undefined)?.user?.id;
      if (typeof userId !== "string" || !userId) return payload;
      const input = request.body as { email?: string; username?: string; phoneNumber?: string } | undefined;
      const accountIdentifier = input?.email ?? input?.username ?? input?.phoneNumber ?? null;
      const ipAddress = request.ip;
      const userAgent = request.headers["user-agent"] ?? null;
      void repository.resolveMembership(userId)
        .catch(() => null)
        .then(async (membership) => {
          await repository.recordLoginLog({
            userId,
            tenantId: membership?.tenant.id ?? null,
            accountIdentifier,
            ipAddress,
            userAgent
          });
        })
        .catch((error) => request.log.error({ err: error }, "failed to record login log"));
    } catch (error) {
      request.log.error({ err: error }, "failed to parse sign-in payload for the login log");
    }
    return payload;
  });

  app.get("/api/health", async () => ({
    status: "ok",
    repository: repository.mode,
    auth: auth.mode,
    time: new Date().toISOString()
  }));

  app.route({
    method: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    url: "/api/auth/*",
    handler: (request, reply) => auth.handle(request, reply)
  });

  app.get("/api/session", async (request) => {
    if (!request.authContext) return {
      authenticated: false, user: null, tenant: null, membership: null,
      enabledModules: [], effectivePermissions: [], delegablePermissions: [], dataScopes: {},
      fieldPolicy: { price: "none", inventory: "none" }
    };
    const context = request.authContext;
    const tenants = await repository.listAvailableTenants(context.user.id, context.principalType === "platform_admin");
    return {
      authenticated: true,
      user: context.user,
      principalType: context.principalType,
      mustChangePassword: context.mustChangePassword,
      passwordChangeRequired: context.mustChangePassword,
      tenant: context.tenant,
      membership: { role: context.role },
      organization: context.tenant,
      organizations: tenants,
      tenants,
      activeOrganizationId: context.tenant.id,
      activeTenantId: context.tenant.id,
      authorizationOrganizationId: context.authorizationTenantId,
      dataOrganizationId: context.tenant.id,
      role: context.role,
      // `permissions` keeps the legacy UI contract during migration, but is
      // derived from the server-calculated grants rather than the membership role.
      permissions: legacyPermissionsForAuthorization(context.authorization.effectivePermissions),
      ...context.authorization
    };
  });

  // Public customer portal. It intentionally returns only configurator data and
  // keeps customer identity separate from Better Auth organization accounts.
  app.get<{ Params: { slug: string } }>("/api/portal/:slug", async (request) => {
    const config = findPortalBySlug(request.params.slug);
    if (!config || !config.enabled) throw new AppError(404, "NOT_FOUND", "Customer portal is not available");
    const template = config.defaultTemplateId ? await repository.getTemplate(config.tenantId, config.defaultTemplateId) : null;
    const session = getPortalSession(request.cookies?.portal_session);
    const designId = session?.customer.id ?? `visitor-${request.id}`;
    if (session) recordPortalEvent({ tenantId: config.tenantId, customerId: session.customer.id, designId, milestone: "opened", configSnapshot: null });
    return {
      portal: { slug: config.slug, enabled: config.enabled, defaultTemplateId: config.defaultTemplateId, visibleModules: config.visibleModules },
      authenticated: Boolean(session),
      customer: session ? { id: session.customer.id, email: session.customer.email } : null,
      template: template ? { id: template.id, name: template.name, configSnapshot: template.latestVersion?.configSnapshot ?? null } : null
    };
  });

  app.post<{ Params: { slug: string }; Body: { email: string; password: string; supportCode: string } }>("/api/portal/:slug/signup", async (request, reply) => {
    const config = findPortalBySlug(request.params.slug);
    if (!config || !config.enabled) throw new AppError(404, "NOT_FOUND", "Customer portal is not available");
    const body = request.body ?? {};
    if (!body.email || !body.password || body.password.length < 6 || body.password.length > 72) throw new AppError(422, "VALIDATION_ERROR", "Email and password are required");
    if (!config.signupCodeHash || hashPortalSecret(String(body.supportCode ?? "")) !== config.signupCodeHash) throw new AppError(403, "FORBIDDEN", "Invalid enterprise support code");
    let customer;
    try { customer = createPortalCustomer(config.tenantId, body.email, body.password); }
    catch (error) { if (error instanceof Error && error.message === "PORTAL_EMAIL_EXISTS") throw new AppError(409, "BAD_REQUEST", "Email is already registered"); throw error; }
    const token = createPortalSession(customer);
    reply.setCookie("portal_session", token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30, secure: false });
    recordPortalEvent({ tenantId: config.tenantId, customerId: customer.id, designId: `portal-${customer.id}`, milestone: "opened", configSnapshot: null });
    return { authenticated: true, customer: { id: customer.id, email: customer.email } };
  });

  app.post<{ Params: { slug: string }; Body: { email: string; password: string } }>("/api/portal/:slug/login", async (request, reply) => {
    const config = findPortalBySlug(request.params.slug);
    if (!config || !config.enabled) throw new AppError(404, "NOT_FOUND", "Customer portal is not available");
    const body = request.body ?? {};
    const customer = findPortalCustomer(config.tenantId, String(body.email ?? ""));
    if (!customer || hashPortalSecret(String(body.password ?? "")) !== customer.passwordHash) throw new AppError(401, "UNAUTHORIZED", "Invalid email or password");
    reply.setCookie("portal_session", createPortalSession(customer), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30, secure: false });
    return { authenticated: true, customer: { id: customer.id, email: customer.email } };
  });

  app.post<{ Params: { slug: string }; Body: { designId: string; milestone: string; configSnapshot?: Record<string, unknown>; moduleId?: string } }>("/api/portal/:slug/events", async (request) => {
    const config = findPortalBySlug(request.params.slug);
    const session = getPortalSession(request.cookies?.portal_session);
    if (!config || !config.enabled) throw new AppError(404, "NOT_FOUND", "Customer portal is not available");
    if (!session || session.tenantId !== config.tenantId) throw new AppError(401, "UNAUTHORIZED", "Registration or login is required");
    const allowed = new Set(["opened", "first_generated", "config_changed", "saved", "exported", "consultation_submitted"]);
    if (!allowed.has(request.body?.milestone)) throw new AppError(422, "VALIDATION_ERROR", "Unknown portal milestone");
    return { item: recordPortalEvent({ tenantId: config.tenantId, customerId: session.customer.id, designId: request.body.designId, milestone: request.body.milestone as never, configSnapshot: request.body.configSnapshot ?? null, moduleId: request.body.moduleId }) };
  });

  app.post<{ Params: { slug: string }; Body: { id?: string; name?: string; configSnapshot: Record<string, unknown> } }>("/api/portal/:slug/drafts", async (request) => {
    const config = findPortalBySlug(request.params.slug);
    const session = getPortalSession(request.cookies?.portal_session);
    if (!config || !config.enabled) throw new AppError(404, "NOT_FOUND", "Customer portal is not available");
    if (!session || session.tenantId !== config.tenantId) throw new AppError(401, "UNAUTHORIZED", "Registration or login is required");
    const draft = savePortalDraft({ id: request.body?.id, tenantId: config.tenantId, customerId: session.customer.id, name: request.body?.name || "C端模型", configSnapshot: request.body.configSnapshot });
    recordPortalEvent({ tenantId: config.tenantId, customerId: session.customer.id, designId: draft.id, milestone: "saved", configSnapshot: draft.configSnapshot });
    return { item: draft };
  });

  app.get<{ Params: { slug: string } }>("/api/portal/:slug/drafts", async (request) => {
    const config = findPortalBySlug(request.params.slug);
    const session = getPortalSession(request.cookies?.portal_session);
    if (!config || !config.enabled) throw new AppError(404, "NOT_FOUND", "Customer portal is not available");
    if (!session || session.tenantId !== config.tenantId) throw new AppError(401, "UNAUTHORIZED", "Registration or login is required");
    return { items: listPortalDrafts(config.tenantId, session.customer.id) };
  });

  app.post("/api/me/change-password", async (request, reply) => {
    const context = authContext(request);
    const input = parse(ChangeOwnPasswordSchema, request.body);
    if (!auth.changePassword) throw new AppError(501, "INTERNAL_ERROR", "Password change is not configured");
    const changed = await auth.changePassword({ headers: request.headers, ...input });
    changed.headers.forEach((value, name) => {
      if (name !== "set-cookie") reply.header(name, value);
    });
    for (const value of changed.headers.getSetCookie()) reply.raw.appendHeader("set-cookie", value);
    await repository.setPasswordChangeRequired(context.user.id, false);
    return changed.response;
  });

  app.get("/api/me/sales-pricing-preferences", async (request) => {
    requireMultiplierPermission(request, "quotes.multiplier.view");
    const context = authContext(request);
    const preference = await repository.getSalesPricingPreference(context.tenant.id, context.user.id);
    return {
      item: preference ?? {
        salesMultiplierBasisPoints: DEFAULT_SALES_MULTIPLIER_BASIS_POINTS,
        source: "system_default",
        updatedAt: null
      }
    };
  });

  app.put("/api/me/sales-pricing-preferences", async (request) => {
    requireMultiplierPermission(request, "quotes.multiplier.manage");
    const input = parse(UpdateSalesPricingPreferenceSchema, request.body);
    const context = authContext(request);
    const item = await repository.setSalesPricingPreference(context.tenant.id, context.user.id, input.salesMultiplierBasisPoints);
    await auditMutation(repository, request, "sales_pricing_preference.updated", "sales_pricing_preference", `${context.tenant.id}:${context.user.id}`, null, item);
    return { item };
  });

  app.get("/api/organization/entitlements", async (request) => {
    const { tenant } = authContext(request);
    requirePermission(request, "platform.entitlements.manage");
    return { items: await repository.listOrganizationEntitlements(tenant.id) };
  });
  app.patch("/api/organization/entitlements", async (request) => {
    requirePermission(request, "platform.entitlements.manage");
    const { tenant, user } = authContext(request);
    const input = parse(UpdateOrganizationEntitlementsSchema, request.body);
    return { items: await repository.updateOrganizationEntitlements(tenant.id, input, user.id) };
  });
  // PUT is retained for clients that replace the complete entitlement document.
  app.put("/api/organization/entitlements", async (request) => {
    requirePermission(request, "platform.entitlements.manage");
    const { tenant, user } = authContext(request);
    const input = parse(UpdateOrganizationEntitlementsSchema, request.body);
    return { items: await repository.updateOrganizationEntitlements(tenant.id, input, user.id) };
  });

  app.get("/api/organization/portal", async (request) => {
    const { tenant } = authContext(request);
    requirePermission(request, "platform.entitlements.manage");
    return { item: getPortalConfig(tenant.id) };
  });

  app.put("/api/organization/portal", async (request) => {
    const { tenant, user } = authContext(request);
    requirePermission(request, "platform.entitlements.manage");
    const body = (request.body ?? {}) as Record<string, unknown>;
    const visibleModules = Array.isArray(body.visibleModules) ? body.visibleModules.map(String).filter(Boolean).slice(0, 100) : undefined;
    const patch: Parameters<typeof updatePortalConfig>[1] = {
      enabled: body.enabled === undefined ? undefined : Boolean(body.enabled),
      slug: body.slug === undefined ? undefined : String(body.slug),
      defaultTemplateId: body.defaultTemplateId === null || body.defaultTemplateId === undefined ? undefined : String(body.defaultTemplateId),
      visibleModules,
      signupCodeHash: body.supportCode ? hashPortalSecret(String(body.supportCode)) : undefined
    };
    let item;
    try {
      item = updatePortalConfig(tenant.id, patch);
    } catch (error) {
      if (error instanceof Error && error.message === "PORTAL_SLUG_EXISTS") throw new AppError(409, "BAD_REQUEST", "门户地址标识已被占用");
      throw error;
    }
    await repository.recordAudit({ tenantId: tenant.id, actorUserId: user.id, action: "organization.portal.updated", entityType: "organization_portal", entityId: tenant.id, requestId: request.id, after: item as unknown as Record<string, unknown> });
    return { item };
  });

  app.get("/api/organization/portal/timeline", async (request) => {
    const { tenant } = authContext(request);
    requireAnyPermission(request, ["platform.entitlements.manage", "audit.view"]);
    return { items: listPortalEvents(tenant.id), drafts: listPortalDrafts(tenant.id) };
  });
  app.post("/api/organization/admins", async (request, reply) => {
    requirePermission(request, "platform.entitlements.manage");
    const parsed = parse(CreateOrganizationAdminSchema, request.body);
    const input = { ...parsed, phone: normalizePhoneNumber(parsed.phone) };
    const response = await idempotent(request, reply, repository, 201, async () => {
      const { tenant, organizationType } = authContext(request);
      const entitlements = await repository.listOrganizationEntitlements(tenant.id);
      if (!entitlements.some((item) => item.module === "accounts" && item.enabled)) {
        throw new AppError(409, "VALIDATION_ERROR", "The accounts module must be enabled before creating an organization administrator");
      }
      if (!auth.createOrganizationAdmin) throw new AppError(501, "INTERNAL_ERROR", "Organization administrator creation is not configured");
      const role = organizationType === "dealer" ? "dealer_admin" : "headquarters_admin";
      const created = await auth.createOrganizationAdmin({ organizationId: tenant.id, ...input, role });
      const item = await repository.createOrganizationAdmin(tenant.id, created.userId, input);
      await auditMutation(repository, request, "organization.admin.created", "account", item.id, null, item);
      return { item };
    }, true);
    if (response) return reply.code(201).send(response);
  });

  app.get<{ Params: { id: string } }>("/api/accounts/:id/authorization", async (request) => {
    requirePermission(request, "permission.delegate");
    const { tenant } = authContext(request);
    const item = await found(repository.getAccountAuthorization(tenant.id, request.params.id), "Account authorization");
    assertAccountAuthorizationAccess(request, item);
    return { item };
  });
  app.get<{ Params: { id: string } }>("/api/accounts/:id/authorization/preview", async (request) => {
    requirePermission(request, "permission.delegate");
    const { tenant } = authContext(request);
    const item = await found(repository.getAccountAuthorization(tenant.id, request.params.id), "Account authorization");
    assertAccountAuthorizationAccess(request, item);
    return { item };
  });
  app.post<{ Params: { id: string } }>("/api/accounts/:id/authorization/preview", async (request) => {
    requirePermission(request, "permission.delegate");
    const { tenant } = authContext(request);
    const current = await found(repository.getAccountAuthorization(tenant.id, request.params.id), "Account authorization");
    assertAccountAuthorizationAccess(request, current);
    const input = parse(UpdateAccountAuthorizationSchema, request.body);
     assertDelegationInput(request, input, current);
    return { item: await found(repository.previewAccountAuthorization(tenant.id, request.params.id, input), "Account authorization") };
  });
  app.put<{ Params: { id: string } }>("/api/accounts/:id/authorization", async (request) => {
    requirePermission(request, "permission.delegate");
    const { tenant, user } = authContext(request);
    const current = await found(repository.getAccountAuthorization(tenant.id, request.params.id), "Account authorization");
    assertAccountAuthorizationAccess(request, current);
    const input = parse(UpdateAccountAuthorizationSchema, request.body);
     assertDelegationInput(request, input, current);
    const item = await repository.updateAccountAuthorization(tenant.id, request.params.id, input, user.id);
    return { item };
  });
  app.post<{ Params: { id: string } }>("/api/accounts/:id/authorization/copy", async (request) => {
    requirePermission(request, "permission.delegate");
    const { tenant, user } = authContext(request);
    const { sourceAccountId } = parse(CopyAccountAuthorizationSchema, request.body);
    if (sourceAccountId === request.params.id) {
      throw new AppError(422, "VALIDATION_ERROR", "Source and target accounts must be different");
    }
    const [source, before] = await Promise.all([
      found(repository.getAccountAuthorization(tenant.id, sourceAccountId), "Source account authorization"),
      found(repository.getAccountAuthorization(tenant.id, request.params.id), "Account authorization")
    ]);
    assertAccountAuthorizationAccess(request, source, "Source account authorization");
    assertAccountAuthorizationAccess(request, before);
    const input: UpdateAccountAuthorizationInput = {
      grants: source.grants,
      dataScopes: Object.values(source.dataScopes)
    };
    assertDelegationInput(request, input);
    const item = await repository.updateAccountAuthorization(tenant.id, request.params.id, input, user.id);
    await auditMutation(repository, request, "account.authorization.copied", "account", request.params.id, before, item, {
      sourceAccountId
    });
    return { item };
  });

  app.get("/api/dealers", async (request) => {
    requirePermission(request, "dealer.manage");
    const { tenant } = authContext(request);
    return { items: await repository.listDealers(tenant.id), nextCursor: null };
  });
  app.post("/api/dealers", async (request, reply) => {
    requirePermission(request, "dealer.manage");
    const parsed = parse(CreateDealerSchema, request.body);
    const input = { ...parsed, contact: parsed.contact || parsed.name, phone: normalizePhoneNumber(parsed.phone) };
    const response = await idempotent(request, reply, repository, 201, async () => {
      const { tenant, user } = authContext(request);
      const item = await repository.createDealer(tenant.id, input);
      if (!auth.createDealerAdmin) throw new AppError(501, "INTERNAL_ERROR", "Dealer account creation is not configured");
      const admin = await auth.createDealerAdmin({
        organizationId: item.organizationId,
        name: input.contact,
        phone: input.phone,
        email: input.email,
        password: input.password
      });
      await repository.ensureDealerAdmin(item.organizationId, admin.userId, { name: input.contact, phone: input.phone, email: input.email });
      await auditMutation(repository, request, "dealer.created", "dealer", item.id, null, item, {
        organizationId: item.organizationId, dealerAdminUserId: admin.userId
      });
      return { item };
    });
    if (response) return reply.code(201).send(response);
  });
  app.patch<{ Params: { id: string } }>("/api/dealers/:id/settlement-rate", async (request) => {
    requirePermission(request, "dealer.manage");
    const input = parse(UpdateDealerSettlementRateSchema, request.body);
    const { tenant } = authContext(request);
    const before = (await repository.listDealers(tenant.id)).find((item) => item.id === request.params.id);
    if (!before) throw new AppError(404, "NOT_FOUND", "Dealer not found");
    const item = await repository.updateDealerSettlementRate(tenant.id, request.params.id, input.settlementRatePercent);
    await auditMutation(repository, request, "dealer.settlement_rate_changed", "dealer", item.id, before, item);
    return { item };
  });

  app.get("/api/accounts", async (request) => {
    requireAnyPermission(request, ["account.manage", "permission.delegate"]);
    const { tenant, user, authorization } = authContext(request);
    const scope = getScope(authorization, "accounts");
    const items = (await repository.listAccounts(tenant.id)).filter((account) => scopeAllowsUser(scope, user.id, account.userId));
    return { items, nextCursor: null };
  });
  app.patch<{ Params: { id: string } }>("/api/accounts/:id/status", async (request) => {
    requirePermission(request, "account.manage");
    const input = parse(UpdateAccountStatusSchema, request.body);
    const { tenant } = authContext(request);
    const before = (await repository.listAccounts(tenant.id)).find((item) => item.id === request.params.id);
    if (!before) throw new AppError(404, "NOT_FOUND", "Account not found");
    assertAccountAuthorizationAccess(request, before, "Account");
    const item = await repository.updateAccountStatus(tenant.id, request.params.id, input.status);
    await auditMutation(repository, request, "account.status_changed", "account", item.id, before, item);
    return { item };
  });
  app.post<{ Params: { id: string } }>("/api/accounts/:id/reset-password", async (request) => {
    requirePermission(request, "account.manage");
    const input = parse(ResetAccountPasswordSchema, request.body);
    const { tenant, user, authorization } = authContext(request);
    const scope = getScope(authorization, "accounts");
    const target = (await repository.listAccounts(tenant.id)).find((account) => account.id === request.params.id);
    if (!target || !scopeAllowsUser(scope, user.id, target.userId)) throw new AppError(404, "NOT_FOUND", "Account not found");
    assertPasswordResetAccess(request, target);
    if (!auth.resetPassword) throw new AppError(501, "INTERNAL_ERROR", "Password reset is not configured");
    await auth.resetPassword({ userId: target.userId, newPassword: input.newPassword });
    await repository.setPasswordChangeRequired(target.userId, true);
    await auditMutation(repository, request, "account.password_reset", "account", target.id, null, {
      userId: target.userId,
      mustChangePassword: true
    });
    return { success: true };
  });

  app.get("/api/employees", async (request) => {
    requirePermission(request, "account.manage");
    const { tenant, user, authorization } = authContext(request);
    const scope = getScope(authorization, "accounts");
    const items = (await repository.listEmployees(tenant.id)).filter((employee) => scopeAllowsUser(scope, user.id, employee.userId));
    return { items, nextCursor: null };
  });
  app.post("/api/employees", async (request, reply) => {
    requirePermission(request, "account.manage");
    const parsed = parse(CreateEmployeeSchema, request.body);
    const input = { ...parsed, phone: normalizePhoneNumber(parsed.phone) };
    const response = await idempotent(request, reply, repository, 201, async () => {
      const { tenant, user } = authContext(request);
      if (!auth.createEmployee) throw new AppError(501, "INTERNAL_ERROR", "Employee creation is not configured");
      const created = await auth.createEmployee({ organizationId: tenant.id, ...input });
      const item = await repository.createEmployee(tenant.id, created.userId, input);
      await auditMutation(repository, request, "employee.created", "employee", item.id, null, item);
      return { item };
    }, true);
    if (response) return reply.code(201).send(response);
  });
  app.patch<{ Params: { id: string } }>("/api/employees/:id/status", async (request) => {
    requirePermission(request, "account.manage");
    const input = parse(UpdateEmployeeStatusSchema, request.body);
    const { tenant } = authContext(request);
    const before = (await repository.listEmployees(tenant.id)).find((employee) => employee.id === request.params.id);
    if (!before) throw new AppError(404, "NOT_FOUND", "Employee not found");
    assertAccountAuthorizationAccess(request, before, "Employee");
    const item = await repository.updateEmployeeStatus(tenant.id, request.params.id, input.status);
    await auditMutation(repository, request, "employee.status_changed", "employee", item.id, before, item);
    return { item };
  });
  app.get<{ Querystring: { employeeId?: string } }>("/api/employees/order-summary", async (request) => {
    const { tenant, authorization } = authContext(request);
    const selection = resolveReportSelection(request, request.query.employeeId);
    const items = filterReportItems(selection, await repository.listEmployeeOrderSummaries(tenant.id, selection.employeeUserId));
    return {
      items: authorization.fieldPolicy.price === "none"
        ? items.map((item) => ({ ...item, totalAmountMinor: null }))
        : items,
      nextCursor: null
    };
  });
  app.get<{ Querystring: { employeeId?: string } }>("/api/employees/follow-up-summary", async (request) => {
    const { tenant } = authContext(request);
    const selection = resolveReportSelection(request, request.query.employeeId);
    return { items: filterReportItems(selection, await repository.listEmployeeFollowUpSummaries(tenant.id, selection.employeeUserId)), nextCursor: null };
  });

  app.get("/api/price-lists", async (request) => {
    requirePermission(request, "prices.master.view");
    const { tenant } = authContext(request);
    return { items: await repository.listPriceLists(tenant.id), nextCursor: null };
  });
  app.post("/api/price-lists", async (request, reply) => {
    requirePermission(request, "prices.manage");
    const input = parse(CreatePriceListSchema, request.body);
    const response = await idempotent(request, reply, repository, 201, async () => {
      const { tenant, user } = authContext(request);
      const item = await repository.createPriceList(tenant.id, input);
      await auditMutation(repository, request, "price_list.created", "price_list", item.id, null, item);
      return { item };
    });
    if (response) return reply.code(201).send(response);
  });
  app.get<{ Params: { id: string } }>("/api/price-lists/:id", async (request) => {
    requirePermission(request, "prices.master.view");
    const { tenant } = authContext(request);
    const item = await found(repository.getPriceList(tenant.id, request.params.id), "Price list");
    const items = await repository.listPriceListItems(tenant.id, item.id);
    const baseline = item.status === "draft"
      ? (await repository.listPriceLists(tenant.id))
          .filter((candidate) => candidate.id !== item.id && candidate.market === item.market && candidate.currency === item.currency && candidate.status === "active")
          .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))[0]
      : undefined;
    const baselineItems = baseline ? await repository.listPriceListItems(tenant.id, baseline.id) : [];
    const baselineByKey = new Map(baselineItems.map((candidate) => [
      `${candidate.materialKey}\u0000${candidate.specKey}`,
      candidate.retailUnitPriceMinor
    ]));
    return {
      item,
      items: items.map((candidate) => ({
        ...candidate,
        previousRetailPriceMinor: item.status === "draft"
          ? baselineByKey.get(`${candidate.materialKey}\u0000${candidate.specKey}`) ?? null
          : candidate.retailUnitPriceMinor
      })),
      baseline: baseline ? { id: baseline.id, version: baseline.version, effectiveFrom: baseline.effectiveFrom } : null
    };
  });
  app.get<{ Params: { id: string } }>("/api/price-lists/:id/export", async (request, reply) => {
    requirePermission(request, "prices.master.view");
    const { tenant } = authContext(request);
    const item = await found(repository.getPriceList(tenant.id, request.params.id), "Price list");
    const items = await repository.listPriceListItems(tenant.id, item.id);
    const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = [
      ["category", "materialCode", "materialKey", "name", "specification", "specKey", "unit", "pricingMethod", "retailUnitPrice", "pricingRule", "note"],
      ...items.map((priceItem) => [
        priceItem.category,
        priceItem.sourceRef ?? priceItem.materialKey,
        priceItem.materialKey,
        priceItem.name,
        priceItem.specification,
        priceItem.specKey,
        priceItem.unit,
        priceItem.pricingMethod,
        priceItem.retailUnitPriceMinor === null ? "" : (priceItem.retailUnitPriceMinor / 100).toFixed(2),
        priceItem.pricingRule ? JSON.stringify(priceItem.pricingRule) : "",
        priceItem.note
      ])
    ];
    reply.header("Content-Disposition", `attachment; filename="${item.code}-${item.version}.csv"`);
    return reply.type("text/csv; charset=utf-8").send(`\ufeff${rows.map((row) => row.map(quote).join(",")).join("\r\n")}`);
  });
  app.put<{ Params: { id: string } }>("/api/price-lists/:id/items", async (request, reply) => {
    requirePermission(request, "prices.manage");
    const input = parse(SavePriceListItemsSchema, request.body);
    const response = await idempotent(request, reply, repository, 200, async () => {
      const { tenant } = authContext(request);
      const before = await found(repository.getPriceList(tenant.id, request.params.id), "Price list");
      const items = await repository.savePriceListItems(tenant.id, request.params.id, input.items);
      const item = await found(repository.getPriceList(tenant.id, request.params.id), "Price list");
      await auditMutation(repository, request, "price_list.items_saved", "price_list", item.id, before, item, { itemCount: items.length });
      return { item, items };
    });
    if (response) return response;
  });
  app.post<{ Params: { id: string } }>("/api/price-lists/:id/import/preview", async (request) => {
    requirePermission(request, "prices.manage");
    const input = parse(PriceListImportPreviewSchema, request.body);
    const { tenant } = authContext(request);
    const item = await found(repository.getPriceList(tenant.id, request.params.id), "Price list");
    const existing = await repository.listPriceListItems(tenant.id, item.id);
    const preview = buildPriceImportPreview(input.rows, existing);
    return {
      previewToken: priceImportPreviewToken(item.id, item.revision, input.rows),
      ...preview
    };
  });
  app.post<{ Params: { id: string } }>("/api/price-lists/:id/import/commit", async (request, reply) => {
    requirePermission(request, "prices.manage");
    const input = parse(PriceListImportCommitSchema, request.body);
    const response = await idempotent(request, reply, repository, 200, async () => {
      const { tenant } = authContext(request);
      const before = await found(repository.getPriceList(tenant.id, request.params.id), "Price list");
      const existing = await repository.listPriceListItems(tenant.id, before.id);
      const preview = buildPriceImportPreview(input.rows, existing);
      const expectedToken = priceImportPreviewToken(before.id, before.revision, input.rows);
      if (input.previewToken && input.previewToken !== expectedToken) {
        throw new AppError(409, "VALIDATION_ERROR", "Import preview is stale; preview the file again", { expectedToken });
      }
      if (preview.errors.length || preview.counts.conflict > 0 || preview.counts.error > 0) {
        throw new AppError(409, "VALIDATION_ERROR", "Price import contains invalid, unknown, or conflicting rows", preview);
      }
      const existingByKey = new Map(existing.map((candidate) => [priceImportIdentity(candidate.materialKey, candidate.specKey), candidate]));
      const updates = input.rows.flatMap((raw, index) => {
        const normalized = normalizePriceImportRow(raw, raw.sourceRow ?? index + 2);
        const current = existingByKey.get(priceImportIdentity(normalized.materialKey, normalized.specKey));
        if (!current || ["included", "composite"].includes(current.pricingMethod)) return [];
        const pricingRule = normalized.pricingRule === undefined ? current.pricingRule : priceImportRule(normalized.pricingRule);
        return [{
          id: current.id,
          materialKey: current.materialKey,
          specKey: current.specKey,
          category: current.category,
          name: normalized.name ?? current.name,
          specification: normalized.specification ?? current.specification,
          unit: normalized.unit ?? current.unit,
          pricingMethod: normalized.pricingMethod ?? (normalized.price === undefined ? "formula" : current.pricingMethod),
          retailUnitPriceMinor: normalized.price === undefined ? current.retailUnitPriceMinor : Math.round(normalized.price * 100),
          pricingRule: pricingRule ?? null,
          note: normalized.note ?? current.note,
          sourceRef: normalized.materialCode ?? current.sourceRef
        }];
      });
      const items = updates.length ? await repository.savePriceListItems(tenant.id, before.id, updates) : existing;
      const item = await found(repository.getPriceList(tenant.id, before.id), "Price list");
      await auditMutation(repository, request, "price_list.import_committed", "price_list", item.id, before, item, {
        updated: preview.counts.updated,
        skipped: preview.counts.skipped,
        rows: input.rows.length,
        previewToken: expectedToken
      });
      return { item, items, previewToken: expectedToken, import: preview.counts };
    });
    if (response) return response;
  });
  app.post<{ Params: { id: string } }>("/api/price-lists/:id/sync-bom", async (request, reply) => {
    requirePermission(request, "prices.manage");
    const response = await idempotent(request, reply, repository, 200, async () => {
      const { tenant } = authContext(request);
      const before = await found(repository.getPriceList(tenant.id, request.params.id), "Price list");
      const existing = await repository.listPriceListItems(tenant.id, before.id);
      const catalog = buildLegacyPriceCatalog();
      const existingByKey = new Map(existing.map((item) => [`${item.materialKey}\u0000${item.specKey}`, item]));
      const syncedCatalog = catalog.map((sourceItem) => {
        const current = existingByKey.get(`${sourceItem.materialKey}\u0000${sourceItem.specKey}`);
        if (!current) return sourceItem;
        return {
          ...sourceItem,
          id: current.id,
          pricingMethod: current.pricingMethod,
          retailUnitPriceMinor: current.retailUnitPriceMinor,
          pricingRule: current.pricingRule,
          note: current.note,
          sourceRef: sourceItem.sourceRef
        };
      });
      const catalogKeys = new Set(catalog.map((item) => `${item.materialKey}\u0000${item.specKey}`));
      const manualItems = existing.filter((item) => !catalogKeys.has(`${item.materialKey}\u0000${item.specKey}`));
      const additions = syncedCatalog.filter((item) => !existingByKey.has(`${item.materialKey}\u0000${item.specKey}`));
      const updates = syncedCatalog.filter((item) => existingByKey.has(`${item.materialKey}\u0000${item.specKey}`));
      const items = await repository.savePriceListItems(tenant.id, before.id, [
        ...syncedCatalog,
        ...manualItems.map((manual) => ({
          id: manual.id,
          materialKey: manual.materialKey,
          specKey: manual.specKey,
          category: manual.category,
          name: manual.name,
          specification: manual.specification,
          unit: manual.unit,
          pricingMethod: manual.pricingMethod,
          retailUnitPriceMinor: manual.retailUnitPriceMinor,
          pricingRule: manual.pricingRule,
          note: manual.note,
          sourceRef: manual.sourceRef
        }))
      ]);
      const item = await found(repository.getPriceList(tenant.id, before.id), "Price list");
      await auditMutation(repository, request, "price_list.bom_synced", "price_list", item.id, before, item, {
        added: additions.length,
        updated: updates.length,
        preservedManual: manualItems.length
      });
      return { item, items, sync: { added: additions.length, updated: updates.length, preservedManual: manualItems.length } };
    });
    if (response) return response;
  });
  app.post<{ Params: { id: string } }>("/api/price-lists/:id/validate", async (request) => {
    requirePermission(request, "prices.manage");
    const { tenant } = authContext(request);
    return repository.validatePriceList(tenant.id, request.params.id);
  });
  app.post<{ Params: { id: string } }>("/api/price-lists/:id/publish", async (request, reply) => {
    requirePermission(request, "prices.manage");
    const input = parse(PublishPriceListSchema, request.body ?? {});
    const response = await idempotent(request, reply, repository, 200, async () => {
      const { tenant, user } = authContext(request);
      const before = await found(repository.getPriceList(tenant.id, request.params.id), "Price list");
      const item = await repository.publishPriceList(tenant.id, before.id, user.id, input.effectiveFrom);
      const items = await repository.listPriceListItems(tenant.id, item.id);
      await auditMutation(repository, request, "price_list.published", "price_list", item.id, before, item);
      return { item, items };
    });
    if (response) return response;
  });
  app.post<{ Params: { id: string } }>("/api/price-lists/:id/clone", async (request, reply) => {
    requirePermission(request, "prices.manage");
    const input = parse(ClonePriceListSchema, request.body ?? {});
    const response = await idempotent(request, reply, repository, 201, async () => {
      const { tenant } = authContext(request);
      const item = await repository.clonePriceList(tenant.id, request.params.id, input);
      await auditMutation(repository, request, "price_list.cloned", "price_list", item.id, null, item, { sourcePriceListId: request.params.id });
      return { item };
    });
    if (response) return reply.code(201).send(response);
  });

  app.post("/api/pricing/calculate", async (request) => {
    if (request.authContext) requirePermission(request, "configurator.use");
    const startedAt = performance.now();
    const input = parse(CalculatePricingSchema, request.body);
    const market = input.market ?? "中国大陆";
    const currency = input.currency ?? "CNY";
    const identity = await auth.getIdentity(request.headers);
    const salesMultiplierBasisPoints = request.authContext?.organizationType === "hq"
      ? input.salesMultiplierBasisPoints ?? await salesMultiplierForRequest(repository, request)
      : undefined;
    let organizationId: string | undefined;
    let pricingTenantId: string | null = null;
    if (identity && !request.authContext) {
      const tenantHeader = request.headers["x-tenant-id"];
      const requestedTenantId = (Array.isArray(tenantHeader) ? tenantHeader[0] : tenantHeader) ?? identity.activeTenantId;
      const membership = await repository.resolveMembership(identity.user.id, requestedTenantId);
      if (membership) {
        organizationId = membership.tenant.id;
        pricingTenantId = await repository.getPricingTenantId(organizationId);
      }
    }
    if (request.authContext) {
      organizationId = request.authContext.tenant.id;
      pricingTenantId = await repository.getPricingTenantId(organizationId);
    }
    pricingTenantId ??= await repository.getPublicPricingTenantId(market, currency);
    if (!pricingTenantId) {
      const result = {
        status: "pending" as const,
        currency,
        priceList: null,
        retailTotalMinor: null,
        salesMultiplierBasisPoints: salesMultiplierBasisPoints ?? null,
        multiplierQuoteTotalMinor: null,
        dealer: null,
        lines: [],
        unmatched: ["NO_ACTIVE_PRICE_LIST"]
      };
      const latencyMs = Math.round(performance.now() - startedAt);
      request.log.warn({ status: result.status, unmatchedCount: result.unmatched.length, latencyMs, market, currency }, "pricing calculation pending");
      return request.authContext ? maskPricingResult(result as unknown as Record<string, unknown>, request.authContext.authorization.fieldPolicy) : result;
    }
    try {
      const baseResult = await calculatePublishedPrice({ repository, pricingTenantId, organizationId, market, currency, bom: buildCanonicalBom(input.configSnapshot) });
      const result = {
        ...baseResult,
        salesMultiplierBasisPoints: salesMultiplierBasisPoints ?? null,
        multiplierQuoteTotalMinor: baseResult.status === "priced" && baseResult.retailTotalMinor !== null && salesMultiplierBasisPoints !== undefined
          ? Math.round(baseResult.retailTotalMinor * salesMultiplierBasisPoints / 10_000)
          : null
      };
      const latencyMs = Math.round(performance.now() - startedAt);
      const logContext = { status: result.status, unmatchedCount: result.unmatched.length, latencyMs, market, currency };
      if (result.status === "pending" || result.unmatched.length) {
        request.log.warn(logContext, "pricing calculation pending");
        await recordPricingFailureAudit({
          repository,
          request,
          pricingTenantId,
          actorUserId: identity?.user.id ?? null,
          entityId: result.priceList?.id ?? pricingTenantId,
          metadata: logContext
        });
      } else {
        request.log.info(logContext, "pricing calculation completed");
      }
      return request.authContext ? maskPricingResult(result as unknown as Record<string, unknown>, request.authContext.authorization.fieldPolicy) : result;
    } catch (error) {
      const latencyMs = Math.round(performance.now() - startedAt);
      const logContext = { status: "error", unmatchedCount: 0, latencyMs, market, currency };
      request.log.error({ ...logContext, err: error }, "pricing calculation failed");
      await recordPricingFailureAudit({
        repository,
        request,
        pricingTenantId,
        actorUserId: identity?.user.id ?? null,
        entityId: pricingTenantId,
        metadata: logContext
      });
      throw error;
    }
  });

  app.get<{ Querystring: { orderId?: string } }>("/api/shipments", async (request) => {
    requirePermission(request, "fulfillment.shipments.view");
    const { tenant } = authContext(request);
    if (request.query.orderId) await foundOrder(repository, request, request.query.orderId);
    const shipments = await repository.listShipments(tenant.id, request.query.orderId);
    if (getScope(authContext(request).authorization, "orders").scope === "organization") return { items: shipments, nextCursor: null };
    const orders = await repository.listOrders(tenant.id);
    const visibleOrderIds = new Set(scopedItems(request, "orders", orders, (order) => ({
      createdByUserId: order.createdByUserId,
      assignedUserId: order.ownerUserId
    })).map((order) => order.id));
    return { items: shipments.filter((shipment) => visibleOrderIds.has(shipment.orderId)), nextCursor: null };
  });
  app.post("/api/shipments", async (request, reply) => {
    requirePermission(request, "fulfillment.shipments.create");
    const input = parse(CreateShipmentSchema, request.body);
    const response = await idempotent(request, reply, repository, 201, async () => {
      const { tenant } = authContext(request);
      const beforeOrder = await foundOrder(repository, request, input.orderId);
      const result = await repository.createShipment(tenant.id, input);
      await auditMutation(repository, request, "shipment.created", "shipment", result.shipment.id, null, result.shipment, {
        orderId: result.shipment.orderId
      });
      if (result.order.revision !== beforeOrder.revision) {
        await auditMutation(repository, request, "order.status_changed", "order", result.order.id, beforeOrder, result.order, {
          shipmentId: result.shipment.id
        });
      }
      return { item: result.shipment };
    }, true);
    if (response) return reply.code(201).send(response);
  });

  app.get<{ Querystring: { entityType?: string; entityId?: string; orderId?: string } }>("/api/attachments", async (request) => {
    requirePermission(request, "attachments.view");
    const { tenant } = authContext(request);
    const entityType = request.query.orderId ? "order" : request.query.entityType;
    const entityId = request.query.orderId ?? request.query.entityId;
    if (entityType && entityId) await assertAttachmentParentAccess(repository, request, entityType, entityId);
    const candidates = await repository.listAttachments(tenant.id, entityType, entityId);
    if (entityType && entityId) return { items: candidates, nextCursor: null };
    const visible = await Promise.all(candidates.map(async (item) => ({
      item,
      visible: await canAccessAttachment(repository, request, item.entityType, item.entityId)
    })));
    return { items: visible.filter((entry) => entry.visible).map((entry) => entry.item), nextCursor: null };
  });
  app.post("/api/attachments", async (request, reply) => {
    requirePermission(request, "attachments.create");
    const input = parse(CreateAttachmentSchema, request.body);
    const response = await idempotent(request, reply, repository, 201, async () => {
      const { tenant, user } = authContext(request);
      await assertAttachmentParentAccess(repository, request, input.entityType, input.entityId);
      const item = await repository.createAttachment(tenant.id, user.id, input);
      await auditMutation(repository, request, "attachment.created", "attachment", item.id, null, item);
      return { item };
    });
    if (response) return reply.code(201).send(response);
  });

  app.get("/api/templates", async (request) => {
    requirePermission(request, "templates.view");
    const { tenant } = authContext(request);
    const policy = authContext(request).authorization.fieldPolicy;
    return { items: (await repository.listTemplates(tenant.id)).map((item) => policy.price === "none" || policy.price === "dealer_only"
      ? { ...item, latestVersion: item.latestVersion ? { ...item.latestVersion, bomSnapshot: scrubPriceData(item.latestVersion.bomSnapshot), pricingSnapshot: {} } : null }
      : item), nextCursor: null };
  });
  app.get<{ Params: { id: string } }>("/api/templates/:id", async (request) => {
    requirePermission(request, "templates.view");
    const { tenant } = authContext(request);
    const item = await found(repository.getTemplate(tenant.id, request.params.id), "Template");
    const policy = authContext(request).authorization.fieldPolicy;
    return { item: policy.price === "none" || policy.price === "dealer_only"
      ? { ...item, latestVersion: item.latestVersion ? { ...item.latestVersion, bomSnapshot: scrubPriceData(item.latestVersion.bomSnapshot), pricingSnapshot: {} } : null }
      : item };
  });

  app.get("/api/customers", async (request) => {
    requirePermission(request, "customers.view");
    const { tenant } = authContext(request);
    return { items: await visibleCustomers(repository, request, await repository.listCustomers(tenant.id)), nextCursor: null };
  });
  app.get<{ Params: { id: string } }>("/api/customers/:id", async (request, reply) => {
    requirePermission(request, "customers.view");
    const { tenant } = authContext(request);
    const item = await found(repository.getCustomer(tenant.id, request.params.id), "Customer");
    if (!(await visibleCustomers(repository, request, [item])).length) throw new AppError(404, "NOT_FOUND", "Customer not found");
    reply.header("ETag", revisionEtag(item.revision));
    return { item };
  });
  app.post("/api/customers", async (request, reply) => {
    requirePermission(request, "customers.create");
    const input = parse(CreateCustomerSchema, request.body);
    const response = await idempotent(request, reply, repository, 201, async () => {
      const { tenant, user } = authContext(request);
      const item = await repository.createCustomer(tenant.id, user.id, input);
      await auditMutation(repository, request, "customer.created", "customer", item.id, null, item);
      return { item };
    });
    if (response) return reply.code(201).send(response);
  });
  app.patch<{ Params: { id: string } }>("/api/customers/:id", async (request, reply) => {
    requirePermission(request, "customers.update");
    const { tenant } = authContext(request);
    const before = await found(repository.getCustomer(tenant.id, request.params.id), "Customer");
    if (!(await visibleCustomers(repository, request, [before])).length) throw new AppError(404, "NOT_FOUND", "Customer not found");
    const item = await repository.updateCustomer(tenant.id, request.params.id, parseIfMatch(request.headers["if-match"]), parse(UpdateCustomerSchema, request.body));
    await auditMutation(repository, request, "customer.updated", "customer", item.id, before, item);
    reply.header("ETag", revisionEtag(item.revision));
    return { item };
  });

  app.get<{ Querystring: { customerId?: string } }>("/api/projects", async (request) => {
    requirePermission(request, "projects.view");
    const { tenant } = authContext(request);
    const projects = scopedItems(request, "projects", await repository.listProjects(tenant.id, request.query.customerId), (project) => ({
      createdByUserId: project.createdByUserId,
      assignedUserId: project.ownerUserId
    }));
    const policy = authContext(request).authorization.fieldPolicy;
    const context = authContext(request);
    const items = await Promise.all((await withProjectCustomerNames(repository, tenant.id, projects))
      .map((item) => redactPlatformUserReferences(repository, context, withPlatformOwnerName(context, maskProjectForAuthorization(item, policy)))));
    return { items, nextCursor: null };
  });
  app.get<{ Params: { id: string } }>("/api/projects/:id", async (request, reply) => {
    requirePermission(request, "projects.view");
    const { tenant } = authContext(request);
    const item = await foundProject(repository, request, request.params.id);
    const [displayItem] = await withProjectCustomerNames(repository, tenant.id, [item]);
    reply.header("ETag", revisionEtag(displayItem.revision));
    return { item: await redactPlatformUserReferences(repository, authContext(request), withPlatformOwnerName(authContext(request), maskProjectForAuthorization(displayItem, authContext(request).authorization.fieldPolicy))) };
  });
  app.post("/api/projects", async (request, reply) => {
    requirePermission(request, "projects.create");
    const input = parse(CreateProjectSchema, request.body);
    const response = await idempotent(request, reply, repository, 201, async () => {
      const { tenant, user } = authContext(request);
      const item = await repository.createProject(tenant.id, user.id, input);
      await auditMutation(repository, request, "project.created", "project", item.id, null, item);
      return { item };
    });
    if (response) return reply.code(201).send(response);
  });
  app.patch<{ Params: { id: string } }>("/api/projects/:id", async (request, reply) => {
    requirePermission(request, "projects.update");
    const { tenant } = authContext(request);
    const before = await foundProject(repository, request, request.params.id);
    const input = parse(UpdateProjectSchema, request.body);
    if (input.ownerUserId !== undefined && input.ownerUserId !== before.ownerUserId) requirePermission(request, "projects.transfer");
    const item = await repository.updateProject(tenant.id, request.params.id, parseIfMatch(request.headers["if-match"]), input);
    await auditMutation(repository, request, "project.updated", "project", item.id, before, item);
    reply.header("ETag", revisionEtag(item.revision));
    return { item };
  });

  app.post<{ Params: { id: string } }>("/api/projects/:id/quote", async (request, reply) => {
    requirePermission(request, "quotes.create");
    const input = parse(CreateProjectQuoteSchema, request.body);
    const organizationType = authContext(request).organizationType;
    assertDealerDoesNotUseMultiplier(request, input.salesMultiplierBasisPoints);
    if (organizationType === "hq") requireMultiplierPermission(request, "quotes.multiplier.manage");
    const response = await idempotent(request, reply, repository, 201, async () => {
      const { tenant, user } = authContext(request);
      const project = await foundProject(repository, request, request.params.id);
      const activeQuote = (await repository.listQuotes(tenant.id, project.id)).find((quote) =>
        !["rejected", "expired", "cancelled"].includes(quote.status)
      );
      if (activeQuote) throw new AppError(409, "IDEMPOTENCY_CONFLICT", "An active quote already exists for this project");

      const design = (await repository.listDesigns(tenant.id, project.id))
        .filter((item) => item.status !== "archived")
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.revision - a.revision)[0];
      if (!design) throw new AppError(409, "VALIDATION_ERROR", "A project design is required before creating a quote");
      const productionValidation = design.pricingSnapshot.productionValidation as Record<string, unknown> | undefined;
      if (productionValidation?.status === "blocked") {
        throw new AppError(409, "VALIDATION_ERROR", "The design has blocking production validation issues", productionValidation);
      }

      const designVersion = await repository.createDesignVersion(tenant.id, design.id, user.id, "Created for project quote");
      await auditMutation(repository, request, "design.version_created", "design", design.id, null, designVersion, {
        versionId: designVersion.id,
        quoteCreation: true,
        nonStandardReview: productionValidation?.status === "needsReview"
      });
      const item = await createPricedQuote(repository, tenant.id, designVersion, {
        projectId: project.id,
        customerId: project.customerId,
        currency: "CNY",
        discountMinor: 0,
        taxRateBasisPoints: 0,
        validUntil: null,
        notes: input.notes ?? null,
        salesMultiplierBasisPoints: organizationType === "hq"
          ? input.salesMultiplierBasisPoints ?? await salesMultiplierForRequest(repository, request)
          : undefined,
        manualTotalMinor: input.manualTotalMinor,
        adjustmentReason: input.adjustmentReason,
        adjustedByUserId: user.id,
        adjustedByName: user.name
      });
      await auditMutation(repository, request, "quote.created", "quote", item.id, null, item, {
        pricingAuthority: (item.snapshot.quoteTerms as Record<string, unknown> | undefined)?.pricingAuthority ?? "server",
        suggestedRetailTotalMinor: item.basePriceTotalMinor,
        basePriceTotalMinor: item.basePriceTotalMinor,
        salesMultiplierBasisPoints: item.salesMultiplierBasisPoints,
        multiplierQuoteTotalMinor: item.multiplierQuoteTotalMinor,
        previousTotalMinor: null,
        finalQuoteTotalMinor: item.totalMinor,
        adjustmentMinor: item.totalMinor - (item.multiplierQuoteTotalMinor ?? item.totalMinor),
        adjustmentReason: input.adjustmentReason ?? null,
        quoteNote: item.notes,
        adjustedByName: user.name
      });
      return { item: maskQuoteForAuthorization(item, authContext(request).authorization.fieldPolicy) };
    });
    if (response) return reply.code(201).header("ETag", revisionEtag(response.item.revision)).send({ ...response, item: maskQuoteForAuthorization(response.item, authContext(request).authorization.fieldPolicy) });
  });

  app.get<{ Params: { id: string } }>("/api/projects/:id/quote-history", async (request) => {
    requirePermission(request, "quotes.view");
    requireMultiplierPermission(request, "quotes.multiplier.view");
    const { tenant } = authContext(request);
    await foundProject(repository, request, request.params.id);
    const projects = await repository.listProjects(tenant.id);
    const owners = new Map(projects.map((project) => [project.id, project.ownerUserId]));
    const visibleQuotes = scopedItems(request, "quotes", await repository.listQuotes(tenant.id, request.params.id), (quote) => ({
      createdByUserId: quote.createdByUserId,
      assignedUserId: owners.get(quote.projectId)
    }));
    const [auditLists, names] = await Promise.all([
      Promise.all(visibleQuotes.map((quote) => repository.listAudit(tenant.id, "quote", quote.id))),
      accountNames(repository, tenant.id)
    ]);
    const items = auditLists.flat()
      .filter((item) => item.action === "quote.created" || item.action === "quote.updated")
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return { items: await withVisibleAuditActors(repository, authContext(request), items, names), nextCursor: null };
  });

  app.get<{ Querystring: { projectId?: string } }>("/api/designs", async (request) => {
    requirePermission(request, "designs.view");
    const { tenant } = authContext(request);
    const designs = await repository.listDesigns(tenant.id, request.query.projectId);
    const projects = await repository.listProjects(tenant.id);
    const owners = new Map(projects.map((project) => [project.id, project.ownerUserId]));
    const policy = authContext(request).authorization.fieldPolicy;
    const context = authContext(request);
    const items = scopedItems(request, "designs", designs, (design) => ({
      createdByUserId: design.createdByUserId,
      assignedUserId: owners.get(design.projectId)
    }));
    return { items: await Promise.all(items.map((item) => redactPlatformUserReferences(repository, context, maskDesignForAuthorization(item, policy)))), nextCursor: null };
  });
  app.post("/api/designs", async (request, reply) => {
    requirePermission(request, "designs.create");
    const input = parse(CreateDesignSchema, request.body);
    const response = await idempotent(request, reply, repository, 201, async () => {
      const { tenant, user } = authContext(request);
      await foundProject(repository, request, input.projectId);
      const item = await repository.createDesign(tenant.id, user.id, input);
      await auditMutation(repository, request, "design.created", "design", item.id, null, item, { pricingAuthority: "server" });
      return { item: maskDesignForAuthorization(item, authContext(request).authorization.fieldPolicy) };
    });
    if (response) return reply.code(201).header("ETag", revisionEtag(response.item.draftRevision)).send(response);
  });
  app.get<{ Params: { id: string } }>("/api/designs/:id", getDesign);
  app.get<{ Params: { id: string } }>("/api/designs/:id/draft", getDesign);
  async function getDesign(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    requirePermission(request, "designs.view");
    const item = await foundDesign(repository, request, request.params.id);
    reply.header("ETag", revisionEtag(item.draftRevision));
    return { item: await redactPlatformUserReferences(repository, authContext(request), maskDesignForAuthorization(item, authContext(request).authorization.fieldPolicy)) };
  }
  app.put<{ Params: { id: string } }>("/api/designs/:id/draft", async (request, reply) => {
    requirePermission(request, "designs.update");
    const { tenant } = authContext(request);
    const before = await foundDesign(repository, request, request.params.id);
    const input = parse(UpdateDesignDraftSchema, request.body);
    const item = await repository.updateDesignDraft(tenant.id, request.params.id, parseIfMatch(request.headers["if-match"]), input);
    await auditMutation(repository, request, "design.draft_updated", "design", item.id, before, item, { pricingAuthority: "server" });
    reply.header("ETag", revisionEtag(item.draftRevision));
    return { item: maskDesignForAuthorization(item, authContext(request).authorization.fieldPolicy) };
  });
  app.post<{ Params: { id: string } }>("/api/designs/:id/versions", async (request, reply) => {
    requirePermission(request, "designs.export");
    const input = parse(CreateDesignVersionSchema, request.body ?? {});
    const response = await idempotent(request, reply, repository, 201, async () => {
      const { tenant, user } = authContext(request);
      const design = await foundDesign(repository, request, request.params.id);
      const productionValidation = design.pricingSnapshot.productionValidation as Record<string, unknown> | undefined;
      if (productionValidation?.status === "blocked") {
        throw new AppError(409, "VALIDATION_ERROR", "The design has blocking production validation issues", productionValidation);
      }
      const item = await repository.createDesignVersion(tenant.id, request.params.id, user.id, input.note);
      await auditMutation(repository, request, "design.version_created", "design", request.params.id, null, item, {
        versionId: item.id,
        nonStandardReview: productionValidation?.status === "needsReview"
      });
      return { item: maskDesignVersionForAuthorization(item, authContext(request).authorization.fieldPolicy) };
    });
    if (response) return reply.code(201).send(response);
  });

  app.get<{ Querystring: { projectId?: string } }>("/api/quotes", async (request) => {
    requirePermission(request, "quotes.view");
    const { tenant } = authContext(request);
    const [items, relations] = await Promise.all([
       repository.listQuotes(tenant.id, request.query.projectId),
      orderDisplayRelations(repository, tenant.id)
    ]);
    const { authorization } = authContext(request);
    const projects = await repository.listProjects(tenant.id);
    const owners = new Map(projects.map((project) => [project.id, project.ownerUserId]));
    const context = authContext(request);
    const visibleQuotes = scopedItems(request, "quotes", items, (quote) => ({
      createdByUserId: quote.createdByUserId,
      assignedUserId: owners.get(quote.projectId)
    }));
    const visibleItems = await Promise.all(visibleQuotes.map((item) => redactPlatformUserReferences(
      repository,
      context,
      withPlatformOwnerName(context, withoutInlinePreviewData(maskQuoteForAuthorization(withQuoteDisplayNames(item, relations), authorization.fieldPolicy)))
    )));
    return { items: visibleItems, nextCursor: null };
  });
  app.get<{ Params: { id: string } }>("/api/quotes/:id", async (request, reply) => {
    requirePermission(request, "quotes.view");
    const { tenant } = authContext(request);
    const item = await foundQuote(repository, request, request.params.id);
    reply.header("ETag", revisionEtag(item.revision));
    return { item: await redactPlatformUserReferences(repository, authContext(request), withPlatformOwnerName(authContext(request), maskQuoteForAuthorization(withQuoteDisplayNames(item, await orderDisplayRelations(repository, tenant.id)), authContext(request).authorization.fieldPolicy))) };
  });
  app.post("/api/quotes", async (request, reply) => {
    requirePermission(request, "quotes.create");
    const input = parse(CreateQuoteSchema, request.body);
    assertDealerDoesNotUseMultiplier(request, input.salesMultiplierBasisPoints);
    if (
      authContext(request).organizationType === "hq"
      && (input.salesMultiplierBasisPoints !== undefined || input.manualTotalMinor !== undefined || input.adjustmentReason !== undefined)
    ) {
      requireMultiplierPermission(request, "quotes.multiplier.manage");
    }
    const response = await idempotent(request, reply, repository, 201, async () => {
      const { tenant, user, organizationType } = authContext(request);
      await foundProject(repository, request, input.projectId);
      const designVersion = await found(repository.getDesignVersion(tenant.id, input.designVersionId), "Design version");
      if (designVersion.designId) {
        const design = await foundDesign(repository, request, designVersion.designId);
        if (design.projectId !== input.projectId) throw new AppError(422, "VALIDATION_ERROR", "Design version is not part of this project");
      }
      const pricingTenantId = await repository.getPricingTenantId(tenant.id);
      const activePriceList = await repository.getActivePriceList(pricingTenantId, CHINA_MAINLAND, input.currency);
      if (!activePriceList) throw new AppError(409, "VALIDATION_ERROR", "Price pending: no active price list");
      const activePriceItems = await repository.listPriceListItems(pricingTenantId, activePriceList.id);
      const quoteCalculator = new ConfiguratorPriceCalculator(toDealerPriceSource(activePriceList, activePriceItems), activePriceItems);
      const calculation = await recalculateQuote({
        bomSnapshot: designVersion.bomSnapshot,
        currency: input.currency,
        discountMinor: input.discountMinor,
        taxRateBasisPoints: input.taxRateBasisPoints,
        calculator: quoteCalculator,
        createId: randomUUID
      });
      const unmatched = calculation.lines.filter((line) => line.pricingStatus === "unmatched");
      if (unmatched.length) throw new AppError(409, "VALIDATION_ERROR", "Price pending: one or more BOM items are not priced", { unmatched: unmatched.map((line) => line.sourceRef) });
      const calculatedAt = new Date().toISOString();
      const multiplierTerms = organizationType === "hq"
        ? createMultiplierQuoteTerms(
            calculation.totalMinor,
            input.salesMultiplierBasisPoints ?? await salesMultiplierForRequest(repository, request),
            input.manualTotalMinor,
            input.adjustmentReason
          )
        : null;
      const finalQuoteTotalMinor = multiplierTerms?.finalQuoteTotalMinor ?? (input.manualTotalMinor ?? calculation.totalMinor);
      const snapshot = createQuoteSnapshot({ designVersion, calculation, calculatedAt, previewDataUrl: input.previewDataUrl });
      snapshot.calculation = { ...calculation, totalMinor: finalQuoteTotalMinor };
      const dealer = await repository.getDealerForOrganization(tenant.id);
      const settlementRatePercent = dealer?.status === "active" ? dealer.settlementRatePercent : null;
      // Keep the recommendation with the frozen quote so manual adjustments can
      // always be compared against the same server-calculated baseline.
      snapshot.quoteTerms = multiplierTerms ? {
        taxRateBasisPoints: input.taxRateBasisPoints,
        pricingAuthority: multiplierTerms.adjustmentMinor === 0 ? "server" : "manual",
        pricingModel: "sales_multiplier",
        suggestedRetailTotalMinor: calculation.totalMinor,
        ...multiplierTerms,
        manualTotalMinor: input.manualTotalMinor ?? null,
        adjustedAt: calculatedAt,
        adjustedByUserId: user.id,
        adjustedByName: user.name
      } : {
        taxRateBasisPoints: input.taxRateBasisPoints,
        pricingAuthority: "server",
        suggestedRetailTotalMinor: calculation.totalMinor
      };
      snapshot.priceList = { id: activePriceList.id, version: activePriceList.version, effectiveFrom: activePriceList.effectiveFrom };
      snapshot.dealerPricing = settlementRatePercent === null
        ? null
        : createDealerPricingSnapshot({
            dealerId: dealer!.id,
            settlementRatePercent,
            retailTotalMinor: calculation.totalMinor,
            lines: calculation.lines
          });
      const item = await repository.createQuote(tenant.id, {
        createdByUserId: user.id,
        projectId: input.projectId,
        customerId: input.customerId ?? null,
        designVersionId: input.designVersionId,
        status: "priced",
        currency: calculation.currency,
        subtotalMinor: calculation.subtotalMinor,
        discountMinor: calculation.discountMinor,
        taxMinor: calculation.taxMinor,
        totalMinor: finalQuoteTotalMinor,
        basePriceTotalMinor: multiplierTerms?.basePriceTotalMinor ?? null,
        salesMultiplierBasisPoints: multiplierTerms?.salesMultiplierBasisPoints ?? null,
        multiplierQuoteTotalMinor: multiplierTerms?.multiplierQuoteTotalMinor ?? null,
        validUntil: input.validUntil ?? null,
        notes: input.notes ?? null,
        lines: calculation.lines,
        snapshot
      });
      await auditMutation(repository, request, "quote.created", "quote", item.id, null, item, {
        pricingAuthority: multiplierTerms?.adjustmentMinor ? "manual" : "server",
        suggestedRetailTotalMinor: calculation.totalMinor,
        basePriceTotalMinor: multiplierTerms?.basePriceTotalMinor ?? null,
        salesMultiplierBasisPoints: multiplierTerms?.salesMultiplierBasisPoints ?? null,
        multiplierQuoteTotalMinor: multiplierTerms?.multiplierQuoteTotalMinor ?? null,
        finalQuoteTotalMinor: item.totalMinor,
        adjustmentMinor: multiplierTerms?.adjustmentMinor ?? 0,
        adjustmentReason: multiplierTerms?.adjustmentReason ?? null,
        createdByName: user.name
      });
      return { item: maskQuoteForAuthorization(item, authContext(request).authorization.fieldPolicy) };
    });
    if (response) return reply.code(201).header("ETag", revisionEtag(response.item.revision)).send(response);
  });
  app.patch<{ Params: { id: string } }>("/api/quotes/:id", async (request, reply) => {
    requirePermission(request, "quotes.update");
    const { tenant, user, organizationType } = authContext(request);
    const before = await foundQuote(repository, request, request.params.id);
    if (!(["draft", "priced"] as const).includes(before.status as "draft" | "priced")) {
      throw new AppError(409, "INVALID_TRANSITION", "Only draft or priced quotes can be edited");
    }
    const input = parse(UpdateQuoteSchema, request.body);
    assertDealerDoesNotUseMultiplier(request, input.salesMultiplierBasisPoints);
    const multiplierPricing = organizationType === "hq" && (quoteHasMultiplierTerms(before) || input.salesMultiplierBasisPoints !== undefined);
    if (multiplierPricing) requireMultiplierPermission(request, "quotes.multiplier.manage");
    const terms = (before.snapshot.quoteTerms ?? {}) as Record<string, unknown>;
    const discountMinor = input.discountMinor ?? before.discountMinor;
    const taxRateBasisPoints = input.taxRateBasisPoints ?? Number(terms.taxRateBasisPoints ?? 0);
    const discounted = Math.max(0, before.subtotalMinor - Math.min(before.subtotalMinor, discountMinor));
    const taxMinor = Math.round(discounted * taxRateBasisPoints / 10000);
    const normalizedDiscountMinor = Math.min(before.subtotalMinor, discountMinor);
    const serverTotalMinor = discounted + taxMinor;
    const pricingChanged = input.discountMinor !== undefined
      || input.taxRateBasisPoints !== undefined
      || input.salesMultiplierBasisPoints !== undefined
      || input.manualTotalMinor !== undefined;
    const multiplierTerms = multiplierPricing
      ? createMultiplierQuoteTerms(
          serverTotalMinor,
          input.salesMultiplierBasisPoints ?? before.salesMultiplierBasisPoints ?? DEFAULT_SALES_MULTIPLIER_BASIS_POINTS,
          input.manualTotalMinor ?? (pricingChanged ? undefined : before.totalMinor),
          input.manualTotalMinor !== undefined
            ? input.adjustmentReason
            : input.adjustmentReason ?? (typeof terms.adjustmentReason === "string" ? terms.adjustmentReason : undefined)
        )
      : null;
    const manualTotalMinor = input.manualTotalMinor;
    const totalMinor = multiplierTerms?.finalQuoteTotalMinor ?? (manualTotalMinor ?? serverTotalMinor);
    const suggestedRetailTotalMinor = multiplierTerms?.basePriceTotalMinor ?? suggestedRetailFromQuote(before);
    const snapshot = structuredClone(before.snapshot);
    snapshot.quoteTerms = multiplierTerms
      ? {
          ...terms,
          taxRateBasisPoints,
          pricingAuthority: multiplierTerms.adjustmentMinor === 0 ? "server" : "manual",
          pricingModel: "sales_multiplier",
          suggestedRetailTotalMinor: multiplierTerms.basePriceTotalMinor,
          ...multiplierTerms,
          manualTotalMinor: manualTotalMinor ?? (pricingChanged ? null : before.totalMinor),
          adjustedAt: new Date().toISOString(),
          adjustedByUserId: user.id,
          adjustedByName: user.name
        }
      : manualTotalMinor === undefined
        ? { ...terms, taxRateBasisPoints, pricingAuthority: "server" }
      : {
          ...terms,
          taxRateBasisPoints,
          pricingAuthority: "manual",
          suggestedRetailTotalMinor,
          manualTotalMinor,
          adjustmentReason: input.adjustmentReason,
          adjustedAt: new Date().toISOString(),
          adjustedByUserId: user.id,
          adjustedByName: user.name
        };
    const previousCalculation = isJsonRecord(snapshot.calculation) ? snapshot.calculation : {};
    snapshot.calculation = {
      ...previousCalculation,
      lines: before.lines,
      subtotalMinor: before.subtotalMinor,
      discountMinor: normalizedDiscountMinor,
      taxMinor,
      totalMinor,
      currency: before.currency
    };
    if (isJsonRecord(snapshot.dealerPricing)) {
      const settlementRatePercent = Number(snapshot.dealerPricing.settlementRatePercent);
      const dealerId = String(snapshot.dealerPricing.dealerId ?? "");
      if (Number.isFinite(settlementRatePercent) && dealerId) {
        snapshot.dealerPricing = createDealerPricingSnapshot({
          dealerId,
          settlementRatePercent,
          retailTotalMinor: multiplierTerms?.basePriceTotalMinor ?? serverTotalMinor,
          lines: before.lines
        });
      }
    }
    const item = await repository.updateQuote(tenant.id, before.id, parseIfMatch(request.headers["if-match"]), {
      discountMinor: normalizedDiscountMinor,
      taxMinor,
      totalMinor,
      basePriceTotalMinor: multiplierTerms?.basePriceTotalMinor ?? before.basePriceTotalMinor,
      salesMultiplierBasisPoints: multiplierTerms?.salesMultiplierBasisPoints ?? before.salesMultiplierBasisPoints,
      multiplierQuoteTotalMinor: multiplierTerms?.multiplierQuoteTotalMinor ?? before.multiplierQuoteTotalMinor,
      validUntil: input.validUntil === undefined ? before.validUntil : input.validUntil,
      notes: input.notes === undefined ? before.notes : input.notes, snapshot
    });
    await auditMutation(repository, request, "quote.updated", "quote", item.id, before, item, multiplierTerms ? {
      pricingAuthority: multiplierTerms.adjustmentMinor === 0 ? "server" : "manual",
      pricingModel: "sales_multiplier",
      suggestedRetailTotalMinor,
      basePriceTotalMinor: multiplierTerms.basePriceTotalMinor,
      salesMultiplierBasisPoints: multiplierTerms.salesMultiplierBasisPoints,
      multiplierQuoteTotalMinor: multiplierTerms.multiplierQuoteTotalMinor,
      previousTotalMinor: before.totalMinor,
      finalQuoteTotalMinor: item.totalMinor,
      adjustmentMinor: multiplierTerms.adjustmentMinor,
      adjustmentReason: multiplierTerms.adjustmentReason,
      quoteNote: item.notes,
      adjustedByName: user.name
    } : manualTotalMinor === undefined ? {} : {
      pricingAuthority: "manual",
      suggestedRetailTotalMinor,
      previousTotalMinor: before.totalMinor,
      finalQuoteTotalMinor: item.totalMinor,
      adjustmentReason: input.adjustmentReason,
      quoteNote: item.notes,
      adjustedByName: user.name
    });
    reply.header("ETag", revisionEtag(item.revision));
    return { item: maskQuoteForAuthorization(item, authContext(request).authorization.fieldPolicy) };
  });
  app.post<{ Params: { id: string } }>("/api/quotes/:id/transitions", async (request, reply) => {
    const input = parse(QuoteTransitionSchema, normalizeQuoteTransition(request.body));
    requirePermission(request, input.to === "approved" ? "quotes.approve" : "quotes.submit");
    if (input.to === "converted") {
      throw new AppError(409, "INVALID_TRANSITION", "Create the sales order explicitly from the customer-confirmed quote");
    }
    const response = await idempotent(request, reply, repository, 200, async () => {
      const { tenant, user } = authContext(request);
      const before = await foundQuote(repository, request, request.params.id);
      try { transitionQuote(before.status, input.to); }
      catch (error) { throw transitionError(error); }
      const item = await repository.transitionQuote(tenant.id, before.id, parseIfMatch(request.headers["if-match"]), input.to);
      await auditMutation(repository, request, "quote.status_changed", "quote", item.id, before, item, { note: input.note ?? null });
      return { item: maskQuoteForAuthorization(item, authContext(request).authorization.fieldPolicy) };
    }, true);
    if (response) return reply.header("ETag", revisionEtag(response.item.revision)).send({ ...response, item: maskQuoteForAuthorization(response.item, authContext(request).authorization.fieldPolicy) });
  });

  app.get<{ Querystring: { projectId?: string } }>("/api/orders", async (request) => {
    requirePermission(request, "orders.view");
    const { tenant } = authContext(request);
    const [items, relations] = await Promise.all([
      repository.listOrders(tenant.id, request.query.projectId),
      orderDisplayRelations(repository, tenant.id)
    ]);
    const { authorization } = authContext(request);
    const visible = scopedItems(request, "orders", items, (order) => ({
      createdByUserId: order.createdByUserId,
      assignedUserId: order.ownerUserId
    }));
    const context = authContext(request);
    const visibleItems = await Promise.all(visible.map((item) => redactPlatformUserReferences(
      repository,
      context,
      withPlatformOwnerName(context, withoutInlinePreviewData(maskOrderForAuthorization(withOrderDisplayNames(item, relations), authorization.fieldPolicy)))
    )));
    return { items: visibleItems, nextCursor: null };
  });
  app.get<{ Params: { id: string } }>("/api/orders/:id", async (request, reply) => {
    requirePermission(request, "orders.view");
    const { tenant } = authContext(request);
    const item = await foundOrder(repository, request, request.params.id);
    const [shipments, relations] = await Promise.all([repository.listShipments(tenant.id, item.id), orderDisplayRelations(repository, tenant.id)]);
    reply.header("ETag", revisionEtag(item.revision));
    return { item: await redactPlatformUserReferences(repository, authContext(request), withPlatformOwnerName(authContext(request), { ...maskOrderForAuthorization(withOrderDisplayNames(item, relations), authContext(request).authorization.fieldPolicy), shipments })) };
  });
  app.post<{ Params: { id: string } }>("/api/orders/:id/contract-export", async (request) => {
    requirePermission(request, "orders.export");
    const item = await foundOrder(repository, request, request.params.id);
    await auditMutation(repository, request, "order.contract_exported", "order", item.id, null, null, {
      orderNo: item.code,
      revision: item.revision,
      format: "html-word-compatible"
    });
    return { item: { id: item.id, orderNo: item.code, revision: item.revision } };
  });
  app.post("/api/orders", async (request, reply) => {
    requirePermission(request, "orders.create");
    const input = parse(CreateOrderSchema, request.body);
    const response = await idempotent(request, reply, repository, 201, async () => {
      const { tenant, user } = authContext(request);
      const quote = await foundQuote(repository, request, input.acceptedQuoteId);
      if (quote.status !== "accepted" && quote.status !== "customer_confirmed") {
        const existingOrder = (await repository.listOrders(tenant.id)).find((item) => item.acceptedQuoteId === quote.id);
        if (existingOrder) {
          return { item: maskOrderForAuthorization(withOrderDisplayNames(existingOrder, await orderDisplayRelations(repository, tenant.id)), authContext(request).authorization.fieldPolicy) };
        }
        throw new AppError(409, "INVALID_TRANSITION", "An order requires a customer-confirmed quote");
      }
      const existingOrder = (await repository.listOrders(tenant.id)).find((item) => item.acceptedQuoteId === quote.id);
      if (existingOrder) {
        return { item: maskOrderForAuthorization(withOrderDisplayNames(existingOrder, await orderDisplayRelations(repository, tenant.id)), authContext(request).authorization.fieldPolicy) };
      }
      const result = await repository.createOrderFromQuote(tenant.id, quote.revision, {
        createdByUserId: user.id,
        projectId: quote.projectId, customerId: quote.customerId, acceptedQuoteId: quote.id,
        status: "draft", currency: quote.currency, totalMinor: quote.totalMinor,
        snapshot: createOrderSnapshot({
          quote: quote as unknown as Record<string, unknown>,
          acceptedAt: new Date().toISOString(),
          previewDataUrl: input.previewDataUrl
        }),
        customerConfirmedAt: quote.updatedAt,
        deliveryLeadTimeDays: input.deliveryLeadTimeDays,
        expectedDeliveryDate: calculateExpectedDeliveryDate(quote.updatedAt, input.deliveryLeadTimeDays),
        productionNote: input.productionNote ?? null, shippingNote: null,
        ownerUserId: null, assignedAt: null, assignedByUserId: null
      });
      await auditMutation(repository, request, "quote.status_changed", "quote", result.quote.id, quote, result.quote, { note: "Order created" });
      await auditMutation(repository, request, "order.created", "order", result.order.id, null, result.order);
      return { item: maskOrderForAuthorization(withOrderDisplayNames(result.order, await orderDisplayRelations(repository, tenant.id)), authContext(request).authorization.fieldPolicy) };
    }, true);
    if (response) return reply.code(201).header("ETag", revisionEtag(response.item.revision)).send({ ...response, item: maskOrderForAuthorization(response.item, authContext(request).authorization.fieldPolicy) });
  });
  app.patch<{ Params: { id: string } }>("/api/orders/:id/delivery-schedule", async (request, reply) => {
    requirePermission(request, "orders.status.update");
    const input = parse(UpdateOrderDeliveryScheduleSchema, request.body);
    const { tenant, user } = authContext(request);
    const before = await foundOrder(repository, request, request.params.id);
    const customerConfirmedAt = inferredCustomerConfirmedAt(before);
    if (!customerConfirmedAt) throw new AppError(409, "VALIDATION_ERROR", "Customer confirmation time is unavailable");
    const expectedDeliveryDate = calculateExpectedDeliveryDate(customerConfirmedAt, input.deliveryLeadTimeDays);
    const item = await repository.updateOrderDeliverySchedule(
      tenant.id,
      request.params.id,
      parseIfMatch(request.headers["if-match"]),
      { ...input, customerConfirmedAt, expectedDeliveryDate }
    );
    await auditMutation(repository, request, "order.delivery_schedule_changed", "order", item.id, before, item, {
      customerConfirmedAt,
      previousDeliveryLeadTimeDays: before.deliveryLeadTimeDays ?? DEFAULT_DELIVERY_LEAD_TIME_DAYS,
      deliveryLeadTimeDays: input.deliveryLeadTimeDays,
      expectedDeliveryDate,
      changedBy: user.id
    });
    reply.header("ETag", revisionEtag(item.revision));
    return { item: maskOrderForAuthorization(withOrderDisplayNames(item, await orderDisplayRelations(repository, tenant.id)), authContext(request).authorization.fieldPolicy) };
  });
  app.post<{ Params: { id: string } }>("/api/orders/:id/transitions", async (request, reply) => {
    requirePermission(request, "orders.status.update");
    const input = parse(OrderTransitionSchema, normalizeOrderTransition(request.body));
    if (!hasOrganizationOrderStatusAccess(request) && !EMPLOYEE_ORDER_TRANSITION_STATUSES.has(input.to)) {
      throw new AppError(403, "FORBIDDEN", "Employees cannot move orders to this status");
    }
    const response = await idempotent(request, reply, repository, 200, async () => {
      const { tenant } = authContext(request);
      const before = await foundOrder(repository, request, request.params.id);
      try { transitionOrder(before.status, input.to); }
      catch (error) { throw transitionError(error); }
      let createdReservation = false;
      if (input.to === "ready_for_production") {
        const existingReservations = await repository.listInventoryReservations(tenant.id, before.id);
        if (!existingReservations.some((reservation) => reservation.status === "active")) {
          const requirements = await orderReservationRequirements(repository, tenant.id, before);
          const mappedRequirements = [];
          for (const requirement of requirements) {
            const material = await repository.getMaterialByKey(tenant.id, { materialKey: requirement.materialKey, specKey: requirement.specKey, color: requirement.color ?? "", finish: requirement.finish ?? "" });
            if (material) mappedRequirements.push({ ...requirement, materialId: material.id });
          }
          if (requirements.length && mappedRequirements.length === requirements.length) {
            await repository.createInventoryReservation(tenant.id, { orderId: before.id, requirements: mappedRequirements }, authContext(request).user.id);
            createdReservation = true;
          }
        }
      }
      let item: Order;
      try {
        item = await repository.transitionOrder(
          tenant.id,
          before.id,
          parseIfMatch(request.headers["if-match"]),
          input.to,
          input.shippingNote,
          authContext(request).user.id
        );
      } catch (error) {
        if (createdReservation) await repository.releaseInventoryReservation(tenant.id, before.id, authContext(request).user.id);
        throw error;
      }
      await auditMutation(repository, request, "order.status_changed", "order", item.id, before, item, { note: input.note ?? null });
      return { item: maskOrderForAuthorization(withOrderDisplayNames(item, await orderDisplayRelations(repository, tenant.id)), authContext(request).authorization.fieldPolicy) };
    }, true);
    if (response) return reply.header("ETag", revisionEtag(response.item.revision)).send({ ...response, item: maskOrderForAuthorization(response.item, authContext(request).authorization.fieldPolicy) });
  });

  app.patch<{ Params: { id: string } }>("/api/orders/:id/assignee", async (request) => {
    requirePermission(request, "orders.assign");
    const input = parse(AssignOrderSchema, request.body);
    const { tenant, user } = authContext(request);
    const before = await foundOrder(repository, request, request.params.id);
    const result = await repository.assignOrder(tenant.id, request.params.id, input, user.id);
    await auditMutation(repository, request, "order.assigned", "order", result.order.id, before, result.order, {
      previousOwnerUserId: result.assignment.previousOwnerUserId,
      ownerUserId: result.assignment.ownerUserId
    });
    return { item: maskOrderForAuthorization(withOrderDisplayNames(result.order, await orderDisplayRelations(repository, tenant.id)), authContext(request).authorization.fieldPolicy), assignment: result.assignment };
  });
  app.get<{ Params: { id: string } }>("/api/orders/:id/follow-ups", async (request) => {
    requirePermission(request, "orders.follow_up");
    const { tenant } = authContext(request);
    await foundOrder(repository, request, request.params.id);
    const [items, names] = await Promise.all([repository.listOrderFollowUps(tenant.id, request.params.id), accountNames(repository, tenant.id)]);
    return { items: items.map((item) => withFollowUpAuthorName(item, names)), nextCursor: null };
  });
  app.post<{ Params: { id: string } }>("/api/orders/:id/follow-ups", async (request, reply) => {
    requirePermission(request, "orders.follow_up");
    const input = parse(CreateOrderFollowUpSchema, request.body);
    const response = await idempotent(request, reply, repository, 201, async () => {
      const { tenant, user } = authContext(request);
      await foundOrder(repository, request, request.params.id);
      const item = await repository.createOrderFollowUp(tenant.id, request.params.id, user.id, input);
      await auditMutation(repository, request, "order.follow_up_created", "order_follow_up", item.id, null, item, { orderId: item.orderId });
      return { item: withFollowUpAuthorName(item, await accountNames(repository, tenant.id)) };
    });
    if (response) return reply.code(201).send(response);
  });

  app.get<{ Querystring: { entityType?: string; entityId?: string } }>("/api/audit-logs", async (request) => {
    requirePermission(request, "audit.view");
    const context = authContext(request);
    const { tenant } = context;
    const [items, names] = await Promise.all([
      repository.listAudit(tenant.id, request.query.entityType, request.query.entityId),
      accountNames(repository, tenant.id)
    ]);
    return { items: await withVisibleAuditActors(repository, context, items, names), nextCursor: null };
  });

  // Super-admin-only, cross-organization login audit. Deliberately guarded by
  // role (not a permission) so it can never appear in permission delegation.
  app.get<{ Querystring: { search?: string; tenantId?: string; start?: string; end?: string; page?: string; pageSize?: string } }>("/api/login-logs", async (request) => {
    requirePlatformAdmin(request);
    const page = Math.max(1, Number(request.query.page ?? "") || 1);
    const pageSize = Math.min(100, Math.max(1, Number(request.query.pageSize ?? "") || 20));
    return repository.listLoginLogs({
      search: request.query.search,
      tenantId: request.query.tenantId,
      start: request.query.start,
      end: request.query.end,
      page,
      pageSize
    });
  });

  app.get("/api/warehouses", async (request) => {
    requirePermission(request, "inventory.distribution.view");
    const { tenant } = authContext(request);
    let items = await repository.listWarehouses(tenant.id);
    if (!items.length) items = [await repository.createWarehouse(tenant.id, { code: "MAIN", name: "Main warehouse", isDefault: true })];
    return { items, nextCursor: null };
  });
  app.post("/api/warehouses", async (request, reply) => {
    requirePermission(request, "inventory.adjust");
    const { tenant } = authContext(request);
    return reply.code(201).send({ item: await repository.createWarehouse(tenant.id, parse(CreateWarehouseSchema, request.body)) });
  });
  app.get<{ Querystring: { search?: string } }>("/api/materials", async (request) => {
    requirePermission(request, "inventory.availability.view");
    const { tenant, authorization } = authContext(request);
    const items = await repository.listMaterials(tenant.id, request.query.search);
    return { items: authorization.fieldPolicy.price === "cost" ? items : scrubMaterialCosts(items), nextCursor: null };
  });
  app.post("/api/materials/import/preview", async (request) => {
    requirePermission(request, "inventory.adjust");
    const { tenant, authorization } = authContext(request);
    if (hasMaterialCostInput(request.body) && (!hasPermission(authorization, "prices.cost.view") || !hasPermission(authorization, "prices.manage"))) {
      throw new AppError(403, "FORBIDDEN", "Material cost import requires cost pricing management permission");
    }
    const body = parse(MaterialImportPreviewSchema, request.body);
    const item = await repository.previewMaterialImport(tenant.id, body);
    return { item: authorization.fieldPolicy.price === "cost" ? item : scrubMaterialCosts(item) };
  });
  app.post("/api/materials/import/commit", async (request, reply) => {
    requirePermission(request, "inventory.adjust");
    const { tenant, user, authorization } = authContext(request);
    if (hasMaterialCostInput(request.body) && (!hasPermission(authorization, "prices.cost.view") || !hasPermission(authorization, "prices.manage"))) {
      throw new AppError(403, "FORBIDDEN", "Material cost import requires cost pricing management permission");
    }
    const input = parse(MaterialImportCommitSchema, request.body);
    const response = await idempotent(request, reply, repository, 201, async () => {
      const result = await repository.commitMaterialImport(tenant.id, input, user.id);
      return authorization.fieldPolicy.price === "cost" ? result : scrubMaterialCosts(result);
    });
    if (response) return reply.code(201).send(response);
  });
  app.post("/api/materials/resolve", async (request) => {
    requirePermission(request, "configurator.use");
    const { tenant } = authContext(request);
    const body = request.body as { bom?: Array<Record<string, unknown>> };
    const bom = Array.isArray(body?.bom) ? body.bom : [];
    const data = await Promise.all(bom.map(async (line, index) => {
      const materialKey = String(line.materialKey ?? line.materialCode ?? "").trim();
      const specKey = String(line.specKey ?? line.spec ?? "").trim();
      const color = String(line.color ?? "");
      const finish = String(line.finish ?? "");
      const material = materialKey && specKey ? await repository.getMaterialByKey(tenant.id, { materialKey, specKey, color, finish }) : null;
      return { lineId: String(line.id ?? `line-${index + 1}`), materialCode: material?.materialCode ?? (materialKey || undefined), materialId: material?.id ?? null, name: String(line.name ?? material?.name ?? ""), spec: specKey, color: color || undefined, finish: finish || undefined, qty: Number(line.qty ?? 0), unit: String(line.unit ?? material?.unit ?? "pcs"), mappingStatus: material ? "matched" : "unmatched" };
    }));
    return { status: "success", source: "erp", updatedAt: new Date().toISOString(), data };
  });
  app.get<{ Querystring: { warehouseId?: string; materialId?: string } }>("/api/inventory/balances", async (request) => {
    requirePermission(request, "inventory.availability.view");
    const { tenant, authorization } = authContext(request);
    const items = await repository.listInventoryBalances(tenant.id, request.query.warehouseId, request.query.materialId ? [request.query.materialId] : undefined);
    if (authorization.fieldPolicy.inventory === "value") return { items, nextCursor: null };
    if (authorization.fieldPolicy.inventory === "distribution") {
      return {
        items: items.map((item) => ({
          ...item,
          onHandQty: null,
          reservedQty: null,
          availableQty: null,
          inboundQty: null,
          outboundQty: null,
          valueMinor: null,
          isAvailable: item.availableQty > 0
        })),
        nextCursor: null
      };
    }
    type RestrictedInventoryBalance = Omit<typeof items[number], "availableQty" | "inboundQty" | "outboundQty" | "valueMinor"> & {
      availableQty: number | null;
      inboundQty: number | null;
      outboundQty: number | null;
      valueMinor: number | null;
      isAvailable?: boolean;
    };
    const aggregate = new Map<string, RestrictedInventoryBalance>();
    for (const item of items) {
      const current = aggregate.get(item.materialId);
      if (!current) {
        aggregate.set(item.materialId, {
          ...item, id: `inventory-${item.materialId}`, warehouseId: "restricted",
          inboundQty: null, outboundQty: null, valueMinor: null,
          onHandQty: authorization.fieldPolicy.inventory === "quantity" ? item.onHandQty : 0,
          reservedQty: authorization.fieldPolicy.inventory === "quantity" ? item.reservedQty : 0,
          availableQty: authorization.fieldPolicy.inventory === "quantity" ? item.availableQty : null,
          isAvailable: item.availableQty > 0
        });
        continue;
      }
      current.isAvailable = Boolean(current.isAvailable || item.availableQty > 0);
      if (authorization.fieldPolicy.inventory === "quantity") {
        current.onHandQty += item.onHandQty;
        current.reservedQty += item.reservedQty;
        current.availableQty = (current.availableQty ?? 0) + item.availableQty;
      }
    }
    return { items: [...aggregate.values()], nextCursor: null };
  });
  app.get("/api/inventory/shortages", async (request) => {
    requirePermission(request, "inventory.availability.view");
    const { tenant, authorization } = authContext(request);
    const quantityVisible = ["quantity", "distribution", "value"].includes(authorization.fieldPolicy.inventory);
    return {
      items: await listInventoryShortages(repository, tenant.id, quantityVisible),
      nextCursor: null
    };
  });
  app.get<{ Querystring: { warehouseId?: string; materialId?: string } }>("/api/inventory/ledger", async (request) => {
    requirePermission(request, "inventory.quantity.view");
    const { tenant } = authContext(request);
    return { items: await repository.listInventoryLedger(tenant.id, request.query.warehouseId, request.query.materialId), nextCursor: null };
  });
  app.get<{ Querystring: { type?: "receive" | "issue" | "adjust" | "transfer" } }>("/api/stock-documents", async (request) => {
    requirePermission(request, "inventory.quantity.view");
    const { tenant } = authContext(request);
    return { items: await repository.listStockDocuments(tenant.id, request.query.type), nextCursor: null };
  });
  app.post("/api/stock-documents", async (request, reply) => {
    const input = parse(CreateStockDocumentSchema, request.body);
    const permission = input.type === "issue" ? "inventory.issue" : input.type === "transfer" ? "inventory.transfer" : input.type === "adjust" ? "inventory.adjust" : "inventory.receive";
    requirePermission(request, permission);
    const { tenant, user } = authContext(request);
    const response = await idempotent(request, reply, repository, 201, async () => ({ item: await repository.createStockDocument(tenant.id, input, user.id) }));
    if (response) return reply.code(201).send(response);
  });
  app.post<{ Params: { id: string } }>("/api/stock-documents/:id/post", async (request, reply) => {
    const { tenant, user } = authContext(request);
    const document = (await repository.listStockDocuments(tenant.id)).find((item) => item.id === request.params.id);
    if (!document) throw new AppError(404, "NOT_FOUND", "Stock document not found");
    const permission = document.type === "issue" ? "inventory.issue" : document.type === "transfer" ? "inventory.transfer" : document.type === "adjust" ? "inventory.adjust" : "inventory.receive";
    requirePermission(request, permission);
    const response = await idempotent(request, reply, repository, 200, async () => ({ item: await repository.postStockDocument(tenant.id, request.params.id, user.id) }));
    if (response) return response;
  });
  app.post<{ Params: { id: string } }>("/api/stock-documents/:id/reverse", async (request, reply) => {
    requirePermission(request, "inventory.adjust");
    const { tenant, user } = authContext(request);
    const response = await idempotent(request, reply, repository, 200, async () => ({ item: await repository.reverseStockDocument(tenant.id, request.params.id, user.id) }));
    if (response) return response;
  });
  app.post<{ Params: { id: string } }>("/api/orders/:id/material-reservation", async (request, reply) => {
    requirePermission(request, "inventory.issue");
    const { tenant, user } = authContext(request);
    await foundOrder(repository, request, request.params.id);
    const input = parse(CreateInventoryReservationSchema, reservationInput(request.params.id, request.body));
    const response = await idempotent(request, reply, repository, 201, async () => ({ items: await repository.createInventoryReservation(tenant.id, input, user.id) }));
    if (response) return reply.code(201).send(response);
  });
  app.get<{ Params: { id: string } }>("/api/orders/:id/material-requirements", async (request) => {
    requirePermission(request, "inventory.availability.view");
    const order = await foundOrder(repository, request, request.params.id);
    return { items: await orderMaterialRequirements(repository, request, order), nextCursor: null };
  });
  app.post<{ Params: { id: string } }>("/api/orders/:id/material-issue", async (request, reply) => {
    requirePermission(request, "inventory.issue");
    const { tenant, user } = authContext(request);
    const order = await foundOrder(repository, request, request.params.id);
    const input = parse(CreateInventoryReservationSchema, reservationInput(order.id, request.body));
    const response = await idempotent(request, reply, repository, 201, async () => {
      await repository.issueInventoryReservation(tenant.id, input, user.id);
      return { items: await orderMaterialRequirements(repository, request, order), nextCursor: null };
    });
    if (response) return reply.code(201).send(response);
  });
  app.post<{ Params: { id: string } }>("/api/orders/:id/material-reservation/release", async (request, reply) => {
    requirePermission(request, "inventory.issue");
    const { tenant, user } = authContext(request);
    await foundOrder(repository, request, request.params.id);
    const response = await idempotent(request, reply, repository, 200, async () => ({ items: await repository.releaseInventoryReservation(tenant.id, request.params.id, user.id) }));
    if (response) return response;
  });
  app.post("/api/inventory/check", async (request) => {
    requirePermission(request, "inventory.availability.view");
    const { tenant, authorization } = authContext(request);
    const body = request.body as { requirements?: Array<Record<string, unknown>>; context?: { warehouseId?: string } };
    const requirements = Array.isArray(body?.requirements) ? body.requirements : [];
    const balances = await repository.listInventoryBalances(tenant.id, body?.context?.warehouseId);
    return { status: "success", source: "erp", updatedAt: new Date().toISOString(), data: requirements.map((line) => {
      const key = [String(line.materialKey ?? line.materialCode ?? ""), String(line.specKey ?? line.spec ?? ""), String(line.color ?? ""), String(line.finish ?? "")].join("\u0000");
      const balance = balances.find((item) => [item.materialKey, item.specKey, item.color, item.finish].join("\u0000") === key);
      const requestedQty = Number(line.qty ?? 0);
      const availableQty = balance?.availableQty ?? 0;
      const base = {
        materialCode: String(line.materialKey ?? line.materialCode ?? "UNMAPPED"),
        materialId: balance?.materialId ?? null,
        status: availableQty >= requestedQty ? "available" : balance ? "shortage" : "unknown"
      } as const;
      if (authorization.fieldPolicy.inventory === "availability") return base;
      if (authorization.fieldPolicy.inventory === "distribution") {
        return { ...base, warehouseId: balance?.warehouseId ?? body?.context?.warehouseId ?? "default" };
      }
      return {
        ...base,
        warehouseId: balance?.warehouseId ?? body?.context?.warehouseId ?? "default",
        requestedQty,
        availableQty,
        reservedQty: balance?.reservedQty ?? 0,
        shortageQty: Math.max(0, requestedQty - availableQty)
      };
    }) };
  });
  app.post("/api/materials/resolve-legacy", async (request) => {
    requirePermission(request, "configurator.use");
    const body = request.body as { bom?: Array<Record<string, unknown>> };
    const bom = Array.isArray(body?.bom) ? body.bom : [];
    return {
      status: "success", source: "erp", updatedAt: new Date().toISOString(),
      data: bom.map((line, index) => ({
        lineId: String(line.id ?? `line-${index + 1}`),
        materialCode: typeof line.materialCode === "string" ? line.materialCode : undefined,
        name: String(line.name ?? ""), spec: String(line.spec ?? ""),
        color: typeof line.color === "string" ? line.color : undefined,
        qty: Number(line.qty ?? 0), unit: String(line.unit ?? "件"),
        mappingStatus: typeof line.materialCode === "string" ? "matched" : "unmatched"
      }))
    };
  });
  app.post("/api/inventory/check-legacy", async (request) => {
    requirePermission(request, "inventory.availability.view");
    const { authorization } = authContext(request);
    const body = request.body as { requirements?: Array<Record<string, unknown>>; context?: { warehouseId?: string } };
    const requirements = Array.isArray(body?.requirements) ? body.requirements : [];
    return {
      status: "success", source: "erp", updatedAt: new Date().toISOString(),
      data: requirements.map((line) => {
        const base = { materialCode: String(line.materialCode ?? "UNMAPPED"), status: "unknown" } as const;
        if (authorization.fieldPolicy.inventory === "availability") return base;
        if (authorization.fieldPolicy.inventory === "distribution") {
          return { ...base, warehouseId: String(body.context?.warehouseId ?? "default") };
        }
        const requestedQty = Number(line.qty ?? 0);
        return {
          ...base,
          warehouseId: String(body.context?.warehouseId ?? "default"),
          requestedQty,
          availableQty: 0,
          reservedQty: 0,
          shortageQty: requestedQty
        };
      })
    };
  });
}

function createDealerPricingSnapshot(input: {
  dealerId: string;
  settlementRatePercent: number;
  retailTotalMinor: number;
  lines: Array<{ id: string; lineTotalMinor: number }>;
}): Record<string, unknown> {
  const retailLineTotalsMinor = allocateTotalByWeights(
    input.lines.map((line) => line.lineTotalMinor),
    input.retailTotalMinor
  );
  const allocation = allocateDealerLineTotals(retailLineTotalsMinor, input.settlementRatePercent);
  return {
    dealerId: input.dealerId,
    settlementRatePercent: input.settlementRatePercent,
    retailTotalMinor: input.retailTotalMinor,
    purchaseTotalMinor: allocation.purchaseTotalMinor,
    lines: input.lines.map((line, index) => ({
      quoteLineId: line.id,
      retailLineTotalMinor: retailLineTotalsMinor[index] ?? 0,
      dealerLineTotalMinor: allocation.lineTotalsMinor[index] ?? 0
    }))
  };
}

async function createPricedQuote(
  repository: Repository,
  tenantId: string,
  designVersion: DesignVersion,
  input: {
    projectId: string;
    customerId: string | null;
    currency: string;
    discountMinor: number;
    taxRateBasisPoints: number;
    validUntil: string | null;
    notes: string | null;
    salesMultiplierBasisPoints?: number;
    manualTotalMinor?: number;
    adjustmentReason?: string;
    adjustedByUserId: string;
    adjustedByName: string;
  }
): Promise<Quote> {
  const pricingTenantId = await repository.getPricingTenantId(tenantId);
  const priceList = await repository.getActivePriceList(pricingTenantId, CHINA_MAINLAND, input.currency);
  if (!priceList) throw new AppError(409, "VALIDATION_ERROR", "Price pending: no active price list");
  const priceItems = await repository.listPriceListItems(pricingTenantId, priceList.id);
  const calculation = await recalculateQuote({
    bomSnapshot: designVersion.bomSnapshot,
    currency: input.currency,
    discountMinor: input.discountMinor,
    taxRateBasisPoints: input.taxRateBasisPoints,
    calculator: new ConfiguratorPriceCalculator(toDealerPriceSource(priceList, priceItems), priceItems),
    createId: randomUUID
  });
  const unmatched = calculation.lines.filter((line) => line.pricingStatus === "unmatched");
  if (unmatched.length) throw new AppError(409, "VALIDATION_ERROR", "Price pending: one or more BOM items are not priced", { unmatched: unmatched.map((line) => line.sourceRef) });
  const calculatedAt = new Date().toISOString();
  const multiplierTerms = input.salesMultiplierBasisPoints === undefined
    ? null
    : createMultiplierQuoteTerms(
        calculation.totalMinor,
        input.salesMultiplierBasisPoints,
        input.manualTotalMinor,
        input.adjustmentReason
      );
  const finalQuoteTotalMinor = multiplierTerms?.finalQuoteTotalMinor ?? (input.manualTotalMinor ?? calculation.totalMinor);
  const snapshot = createQuoteSnapshot({ designVersion, calculation, calculatedAt });
  snapshot.calculation = { ...calculation, totalMinor: finalQuoteTotalMinor };
  snapshot.quoteTerms = multiplierTerms
    ? {
        taxRateBasisPoints: input.taxRateBasisPoints,
        pricingAuthority: multiplierTerms.adjustmentMinor === 0 ? "server" : "manual",
        pricingModel: "sales_multiplier",
        suggestedRetailTotalMinor: calculation.totalMinor,
        ...multiplierTerms,
        manualTotalMinor: input.manualTotalMinor ?? null,
        adjustedAt: calculatedAt,
        adjustedByUserId: input.adjustedByUserId,
        adjustedByName: input.adjustedByName
      }
    : {
        taxRateBasisPoints: input.taxRateBasisPoints,
        pricingAuthority: input.manualTotalMinor === undefined ? "server" : "manual",
        suggestedRetailTotalMinor: calculation.totalMinor,
        manualTotalMinor: input.manualTotalMinor ?? null,
        adjustmentReason: input.manualTotalMinor === undefined ? null : input.adjustmentReason ?? null,
        adjustedAt: calculatedAt,
        adjustedByUserId: input.adjustedByUserId,
        adjustedByName: input.adjustedByName
      };
  snapshot.priceList = { id: priceList.id, version: priceList.version, effectiveFrom: priceList.effectiveFrom };
  const dealer = await repository.getDealerForOrganization(tenantId);
  snapshot.dealerPricing = dealer?.status === "active"
    ? createDealerPricingSnapshot({ dealerId: dealer.id, settlementRatePercent: dealer.settlementRatePercent, retailTotalMinor: calculation.totalMinor, lines: calculation.lines })
    : null;
  return repository.createQuote(tenantId, {
    createdByUserId: input.adjustedByUserId,
    projectId: input.projectId,
    customerId: input.customerId,
    designVersionId: designVersion.id,
    status: "priced",
    currency: calculation.currency,
    subtotalMinor: calculation.subtotalMinor,
    discountMinor: calculation.discountMinor,
    taxMinor: calculation.taxMinor,
    totalMinor: finalQuoteTotalMinor,
    basePriceTotalMinor: multiplierTerms?.basePriceTotalMinor ?? null,
    salesMultiplierBasisPoints: multiplierTerms?.salesMultiplierBasisPoints ?? null,
    multiplierQuoteTotalMinor: multiplierTerms?.multiplierQuoteTotalMinor ?? null,
    validUntil: input.validUntil,
    notes: input.notes,
    lines: calculation.lines,
    snapshot
  });
}

function allocateTotalByWeights(weights: number[], totalMinor: number): number[] {
  const normalizedWeights = weights.map((value) => Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0);
  const normalizedTotalMinor = Number.isFinite(totalMinor) ? Math.max(0, Math.round(totalMinor)) : 0;
  const weightTotal = normalizedWeights.reduce((sum, value) => sum + value, 0);
  if (!weightTotal) return normalizedWeights.map(() => 0);

  const allocated = normalizedWeights.map((value) => Math.round(normalizedTotalMinor * value / weightTotal));
  let lastWeightedIndex = -1;
  for (let index = normalizedWeights.length - 1; index >= 0; index -= 1) {
    if (normalizedWeights[index] > 0) {
      lastWeightedIndex = index;
      break;
    }
  }
  if (lastWeightedIndex >= 0) {
    allocated[lastWeightedIndex] += normalizedTotalMinor - allocated.reduce((sum, value) => sum + value, 0);
  }
  return allocated;
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function recordPricingFailureAudit(input: {
  repository: Repository;
  request: FastifyRequest;
  pricingTenantId: string;
  actorUserId: string | null;
  entityId: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  try {
    await input.repository.recordAudit({
      tenantId: input.pricingTenantId,
      actorUserId: input.actorUserId,
      action: "pricing.calculation_failed",
      entityType: "pricing_calculation",
      entityId: input.entityId,
      requestId: input.request.id,
      before: null,
      after: null,
      metadata: input.metadata
    });
  } catch (auditError) {
    input.request.log.warn({ err: auditError, ...input.metadata }, "pricing failure audit could not be recorded");
  }
}

async function found<T>(value: Promise<T | null>, label: string): Promise<T> {
  const result = await value;
  if (!result) throw new AppError(404, "NOT_FOUND", `${label} not found`);
  return result;
}

function transitionError(error: unknown): AppError {
  if (error instanceof InvalidTransitionError) {
    return new AppError(409, "INVALID_TRANSITION", error.message, { from: error.from, to: error.to });
  }
  return new AppError(500, "INTERNAL_ERROR", "State transition failed");
}

function legacyPermissionsForAuthorization(effectivePermissions: import("@usm/contracts").Permission[]): string[] {
  const permissions = new Set<string>();
  const add = (permission: string, legacy: string) => {
    if (effectivePermissions.includes(permission as import("@usm/contracts").Permission)) permissions.add(legacy);
  };
  add("templates.view", "templates:read");
  add("customers.view", "customers:read");
  if (effectivePermissions.some((permission) => ["customers.create", "customers.update", "customers.delete"].includes(permission))) permissions.add("customers:write");
  add("projects.view", "projects:read");
  if (effectivePermissions.some((permission) => ["projects.create", "projects.update", "projects.delete", "projects.transfer"].includes(permission))) permissions.add("projects:write");
  add("designs.view", "designs:read");
  if (effectivePermissions.some((permission) => ["designs.create", "designs.update", "designs.copy", "designs.delete"].includes(permission))) permissions.add("designs:write");
  add("quotes.view", "quotes:read");
  if (effectivePermissions.some((permission) => ["quotes.create", "quotes.update", "quotes.cancel"].includes(permission))) permissions.add("quotes:write");
  if (effectivePermissions.some((permission) => ["quotes.submit", "quotes.cancel"].includes(permission))) permissions.add("quotes:transition");
  add("quotes.approve", "quotes:approve");
  add("orders.view", "orders:read");
  add("orders.create", "orders:write");
  if (effectivePermissions.some((permission) => ["orders.status.update", "orders.cancel", "orders.assign"].includes(permission))) permissions.add("orders:transition");
  add("fulfillment.shipments.view", "shipments:read");
  if (effectivePermissions.includes("fulfillment.shipments.create")) permissions.add("shipments:write");
  add("dealer.manage", "dealers:write");
  add("account.manage", "accounts:write");
  add("prices.master.view", "price-lists:read");
  add("prices.manage", "price-lists:write");
  add("attachments.view", "attachments:read");
  return [...permissions];
}

function normalizeQuoteTransition(value: unknown): unknown {
  const input = value as { to?: unknown; action?: unknown; note?: unknown } | null;
  if (!input || input.to !== undefined || typeof input.action !== "string") return value;
  const transitions: Record<string, string> = {
    price: "priced", submit: "submitted", send: "sent", approve: "approved",
    request_changes: "changes_requested", confirm_customer: "customer_confirmed",
    convert: "converted", accept: "accepted", reject: "rejected",
    expire: "expired", cancel: "cancelled", revise: "draft"
  };
  return { to: transitions[input.action] ?? input.action, note: input.note };
}

function normalizeOrderTransition(value: unknown): unknown {
  const input = value as { to?: unknown; action?: unknown; note?: unknown; shippingNote?: unknown } | null;
  if (!input || input.to !== undefined || typeof input.action !== "string") return value;
  const transitions: Record<string, string> = {
    confirm: "confirmed", ready_for_production: "ready_for_production",
    start_production: "in_production", ready_to_ship: "ready_to_ship",
    ship: "shipped", hold: "on_hold", cancel: "cancelled"
  };
  return { to: transitions[input.action] ?? input.action, note: input.note, shippingNote: input.shippingNote };
}
