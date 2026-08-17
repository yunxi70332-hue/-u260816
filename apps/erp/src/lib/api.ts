import type {
  AuditEvent,
  AccountAuthorization,
  AccountSummary,
  AuthorizationDataScope,
  OrganizationEntitlement,
  PermissionGrant,
  CreateShipmentInput,
  CustomerProject,
  Dealer,
  DesignTemplate,
  SavedDesignDraft,
  EmployeeFollowUpSummary,
  EmployeeOrderSummary,
  FactoryEmployee,
  InventoryBalance,
  InventoryShortageAlert,
  InventoryLedgerEntry,
  InventoryImportPreview,
  InventoryMaterial,
  InventoryRequirement,
  StockDocument,
  StockDocumentLineInput,
  Warehouse,
  Order,
  OrderDetail,
  OrderFollowUp,
  OrderLine,
  PriceList,
  PriceListDetail,
  PriceListItem,
  PriceListValidationResult,
  ProductionStep,
  Quote,
  QuoteAdjustmentAudit,
  Session,
  Shipment,
  WorkspaceData
} from "../types";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "../types";
import { createClientId } from "./id";
import { projectOrderConfiguration } from "./order-configuration";

const API_BASE = (import.meta.env.VITE_API_BASE || "/api").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status = 0,
    public readonly code = "NETWORK_ERROR",
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  tenantId?: string;
  expectedVersion?: number;
  idempotencyKey?: string;
};

type Raw = Record<string, any>;

export interface QuoteMutationInput {
  manualTotalMinor?: number;
  salesMultiplierBasisPoints?: number;
  adjustmentReason?: string;
  notes?: string | null;
}

function asRecord(value: unknown): Raw {
  return value && typeof value === "object" ? value as Raw : {};
}

function unwrapItem<T>(payload: unknown): T {
  const raw = asRecord(payload);
  return (raw.item ?? raw.data ?? payload) as T;
}

function unwrapList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  const raw = asRecord(payload);
  const value = raw.items ?? raw.data ?? raw.results;
  return Array.isArray(value) ? value as T[] : [];
}

function display(value: unknown, fallback: string): string {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function nullableDisplay(value: unknown): string | null {
  return value === null || value === undefined || value === "" ? null : String(value);
}

function normalizeLoginPhone(value: string): string | null {
  const compact = value.replace(/[\s()-]/g, "");
  if (/^1[3-9]\d{9}$/.test(compact)) return `+86${compact}`;
  if (/^86(1[3-9]\d{9})$/.test(compact)) return `+${compact}`;
  return /^\+[1-9]\d{7,14}$/.test(compact) ? compact : null;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, tenantId, expectedVersion, idempotencyKey, ...init } = options;
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("X-Request-Id", createClientId());
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (tenantId) headers.set("X-Tenant-Id", tenantId);
  if (expectedVersion !== undefined) headers.set("If-Match", String(expectedVersion));
  if (init.method && init.method !== "GET" && init.method !== "HEAD") {
    headers.set("Idempotency-Key", idempotencyKey || createClientId());
  }

  let response: Response;
  try {
    response = await fetch(API_BASE + path, {
      ...init,
      headers,
      credentials: "include",
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (error) {
    throw new ApiError("Unable to connect to the operations API.", 0, "NETWORK_ERROR", error);
  }

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    const raw = asRecord(payload);
    const nested = asRecord(raw.error);
    throw new ApiError(
      display(raw.message ?? nested.message, "Request failed (" + response.status + ")"),
      response.status,
      display(raw.code ?? nested.code, "API_ERROR"),
      payload
    );
  }
  return payload as T;
}

function status<T extends string>(value: unknown, map: Record<string, T>, fallback: T): T {
  return map[String(value ?? "")] ?? fallback;
}

const projectStatus: Record<string, CustomerProject["stage"]> = {
  lead: "\u7ebf\u7d22",
  proposal: "\u65b9\u6848\u4e2d",
  designing: "\u65b9\u6848\u4e2d",
  quoted: "\u5df2\u62a5\u4ef7",
  won: "\u5df2\u6210\u4ea4",
  paused: "\u6682\u505c",
  on_hold: "\u6682\u505c",
  lost: "\u6682\u505c",
  closed: "\u6682\u505c"
};

const quoteStatus: Record<string, Quote["status"]> = {
  draft: "\u8349\u7a3f",
  priced: "\u8349\u7a3f",
  submitted: "\u5f85\u5ba1\u6279",
  changes_requested: "\u9700\u4fee\u6539",
  approved: "\u5df2\u6279\u51c6",
  sent: "\u5df2\u53d1\u9001",
  customer_confirmed: "\u5ba2\u6237\u5df2\u786e\u8ba4",
  accepted: "\u5df2\u63a5\u53d7",
  converted: "\u5df2\u8f6c\u8ba2\u5355",
  rejected: "\u5df2\u5931\u6548",
  expired: "\u5df2\u5931\u6548",
  cancelled: "\u5df2\u5931\u6548"
};

const orderStatus: Record<string, Order["status"]> = {
  draft: "\u5f85\u786e\u8ba4",
  confirmed: "\u5df2\u786e\u8ba4",
  technical_review: "\u5df2\u786e\u8ba4",
  ready_for_production: "\u5f85\u751f\u4ea7",
  in_production: "\u751f\u4ea7\u4e2d",
  ready_to_ship: "\u5f85\u53d1\u8d27",
  shipped: "\u5df2\u53d1\u8d27",
  delivered: "\u5df2\u53d1\u8d27",
  completed: "\u5df2\u53d1\u8d27",
  on_hold: "\u6682\u505c",
  cancelled: "\u5df2\u53d6\u6d88"
};

const productionStatus: Record<string, Order["productionStatus"]> = {
  planned: "\u672a\u6392\u4ea7",
  not_started: "\u672a\u6392\u4ea7",
  material_prep: "\u5907\u6599",
  assembling: "\u7ec4\u88c5",
  in_production: "\u7ec4\u88c5",
  quality_check: "\u8d28\u68c0",
  completed: "\u5df2\u5b8c\u5de5"
};

const shipmentStatus: Record<string, Order["shipmentStatus"]> = {
  not_created: "\u672a\u521b\u5efa",
  ready: "\u5f85\u63d0\u8d27",
  ready_to_pickup: "\u5f85\u63d0\u8d27",
  in_transit: "\u8fd0\u8f93\u4e2d",
  shipped: "\u8fd0\u8f93\u4e2d",
  delivered: "\u5df2\u7b7e\u6536",
  signed: "\u5df2\u7b7e\u6536"
};

function normalizeProject(payload: unknown): CustomerProject {
  const raw = asRecord(payload);
  const customer = asRecord(raw.customer);
  const quoteTerms = asRecord(raw.quoteTerms ?? asRecord(raw.quoteSnapshot).quoteTerms ?? asRecord(raw.snapshot).quoteTerms);
  const quoteTotalMinor = raw.quoteTotalMinor;
  const suggestedRetailTotalMinor = raw.suggestedRetailTotalMinor;
  const basePriceTotalMinor = raw.basePriceTotalMinor ?? raw.base_price_total_minor ?? quoteTerms.basePriceTotalMinor ?? quoteTerms.base_price_total_minor ?? suggestedRetailTotalMinor;
  const salesMultiplierBasisPoints = raw.salesMultiplierBasisPoints ?? raw.sales_multiplier_basis_points ?? quoteTerms.salesMultiplierBasisPoints ?? quoteTerms.sales_multiplier_basis_points;
  const multiplierQuoteTotalMinor = raw.multiplierQuoteTotalMinor ?? raw.multiplier_quote_total_minor ?? quoteTerms.multiplierQuoteTotalMinor ?? quoteTerms.multiplier_quote_total_minor;
  const quoteId = raw.quoteId === null || raw.quoteId === undefined ? null : String(raw.quoteId);
  const quoteRevision = raw.quoteRevision === null || raw.quoteRevision === undefined ? null : Number(raw.quoteRevision);
  const rawQuoteSource = String(raw.quoteSource ?? "");
  const quoteSource: CustomerProject["quoteSource"] = ["quote", "manual", "suggested_retail"].includes(rawQuoteSource)
    ? rawQuoteSource as CustomerProject["quoteSource"]
    : quoteId ? "quote" : suggestedRetailTotalMinor === null || suggestedRetailTotalMinor === undefined ? null : "suggested_retail";
  const quoteStatusValue = raw.quoteStatus === null || raw.quoteStatus === undefined ? null : String(raw.quoteStatus);
  return {
    id: display(raw.id ?? raw.projectId, createClientId()),
    code: display(raw.code ?? raw.projectCode ?? raw.id, "PJ-UNKNOWN"),
    customer: display(raw.customerName ?? customer.name ?? raw.customer, "\u672a\u547d\u540d\u5ba2\u6237"),
    contact: display(raw.contact ?? customer.contact, "-"),
    phone: display(raw.phone ?? customer.phone, "-"),
    name: display(raw.name ?? raw.projectName, "\u672a\u547d\u540d\u9879\u76ee"),
    site: display(raw.site ?? raw.address, "-"),
    owner: display(raw.ownerName ?? asRecord(raw.owner).name, "\u672a\u5206\u914d"),
    stage: status(raw.status ?? raw.stage, projectStatus, "\u7ebf\u7d22"),
    budget: raw.budget !== undefined ? Number(raw.budget) : Number(raw.budgetMinor ?? 0) / 100,
    quoteAmount: quoteTotalMinor === null || quoteTotalMinor === undefined ? null : Number(quoteTotalMinor) / 100,
    suggestedQuoteAmount: suggestedRetailTotalMinor === null || suggestedRetailTotalMinor === undefined ? null : Number(suggestedRetailTotalMinor) / 100,
    quoteSource,
    quoteId,
    quoteRevision,
    quoteStatus: quoteStatusValue,
    quoteEditable: typeof raw.quoteEditable === "boolean"
      ? raw.quoteEditable
      : quoteId
        ? ["draft", "priced"].includes(quoteStatusValue ?? "")
        : suggestedRetailTotalMinor !== null && suggestedRetailTotalMinor !== undefined,
    quoteNote: raw.quoteNote === null || raw.quoteNote === undefined || String(raw.quoteNote).trim() === ""
      ? null
      : String(raw.quoteNote),
    basePriceTotalMinor: basePriceTotalMinor === null || basePriceTotalMinor === undefined ? null : Number(basePriceTotalMinor),
    salesMultiplierBasisPoints: salesMultiplierBasisPoints === null || salesMultiplierBasisPoints === undefined ? null : Number(salesMultiplierBasisPoints),
    multiplierQuoteTotalMinor: multiplierQuoteTotalMinor === null || multiplierQuoteTotalMinor === undefined ? null : Number(multiplierQuoteTotalMinor),
    updatedAt: display(raw.updatedAt ?? raw.updated_at, "-")
  };
}

function normalizeTemplate(payload: unknown): DesignTemplate {
  const raw = asRecord(payload);
  const layout = Array.isArray(raw.layout) ? raw.layout.map(Number) : [2, 2, 2];
  const templateStatus: Record<string, DesignTemplate["status"]> = {
    published: "\u5df2\u53d1\u5e03",
    archived: "\u5df2\u5f52\u6863",
    draft: "\u8349\u7a3f"
  };
  return {
    id: display(raw.id, createClientId()),
    name: display(raw.name ?? raw.title, "\u672a\u547d\u540d\u6a21\u677f"),
    code: display(raw.code ?? raw.templateCode ?? raw.id, "TPL-UNKNOWN"),
    category: (raw.category ?? "\u529e\u516c") as DesignTemplate["category"],
    dimensions: display(raw.dimensions ?? raw.size, "-"),
    modules: Number(raw.modules ?? raw.moduleCount ?? layout.reduce((total, item) => total + item, 0)),
    version: Number(raw.version ?? raw.latestVersion ?? raw.revision ?? 1),
    status: status(raw.status, templateStatus, "\u8349\u7a3f"),
    usageCount: Number(raw.usageCount ?? raw.usage_count ?? 0),
    updatedAt: display(raw.updatedAt ?? raw.updated_at, "-"),
    layout
  };
}

function normalizeSavedDesignDraft(payload: unknown): SavedDesignDraft {
  const raw = asRecord(payload);
  const rawStatus = String(raw.status ?? "draft");
  const status: SavedDesignDraft["status"] = ["draft", "review", "approved", "archived"].includes(rawStatus)
    ? rawStatus as SavedDesignDraft["status"]
    : "draft";
  return {
    id: display(raw.id, createClientId()),
    code: display(raw.code ?? raw.designCode ?? raw.id, "DSN-UNKNOWN"),
    projectId: display(raw.projectId, ""),
    name: display(raw.name, "未命名草稿模型"),
    status,
    draftRevision: Number(raw.draftRevision ?? raw.revision ?? 1),
    updatedAt: display(raw.updatedAt ?? raw.updated_at, "-")
  };
}

function normalizeQuote(payload: unknown): Quote {
  const raw = asRecord(payload);
  const customer = asRecord(raw.customer);
  const project = asRecord(raw.project);
  const quoteTerms = asRecord(raw.quoteTerms ?? asRecord(raw.snapshot).quoteTerms);
  const subtotalMinor = Number(raw.subtotalMinor ?? 0);
  const discount = raw.discount !== undefined || raw.discountRate !== undefined
    ? Number(raw.discount ?? raw.discountRate)
    : subtotalMinor > 0 ? Math.round((subtotalMinor - Number(raw.discountMinor ?? 0)) / subtotalMinor * 100) : 100;
  return {
    id: display(raw.id, createClientId()),
    quoteNo: display(raw.quoteNo ?? raw.code ?? raw.number ?? raw.id, "QT-UNKNOWN"),
    customer: display(raw.customerName ?? customer.name ?? raw.customer, "\u672a\u547d\u540d\u5ba2\u6237"),
    project: display(raw.projectName ?? project.name ?? raw.project, "\u672a\u547d\u540d\u9879\u76ee"),
    owner: display(raw.ownerName ?? asRecord(raw.owner).name, "\u672a\u5206\u914d"),
    amount: raw.amount !== undefined ? Number(raw.amount) : Number(raw.totalMinor ?? 0) / 100,
    discount,
    status: status(raw.status, quoteStatus, "\u8349\u7a3f"),
    validUntil: display(raw.validUntil ?? raw.valid_until, "-"),
    version: Number(raw.version ?? raw.revision ?? 1),
    basePriceTotalMinor: raw.basePriceTotalMinor ?? raw.base_price_total_minor ?? quoteTerms.basePriceTotalMinor ?? quoteTerms.base_price_total_minor ?? quoteTerms.suggestedRetailTotalMinor ?? null,
    salesMultiplierBasisPoints: raw.salesMultiplierBasisPoints ?? raw.sales_multiplier_basis_points ?? quoteTerms.salesMultiplierBasisPoints ?? quoteTerms.sales_multiplier_basis_points ?? null,
    multiplierQuoteTotalMinor: raw.multiplierQuoteTotalMinor ?? raw.multiplier_quote_total_minor ?? quoteTerms.multiplierQuoteTotalMinor ?? quoteTerms.multiplier_quote_total_minor ?? null,
    updatedAt: display(raw.updatedAt ?? raw.updated_at, "-")
  };
}

function normalizeOrder(payload: unknown): Order {
  const raw = asRecord(payload);
  const customer = asRecord(raw.customer);
  const project = asRecord(raw.project);
  const owner = asRecord(raw.owner ?? raw.assignee ?? raw.assignedEmployee);
  const rawStatus = raw.status ?? "draft";
  const productionFallback: Order["productionStatus"] = ["ready_to_ship", "shipped", "delivered", "completed"].includes(String(rawStatus))
    ? "\u5df2\u5b8c\u5de5"
    : "\u672a\u6392\u4ea7";
  return {
    id: display(raw.id, createClientId()),
    orderNo: display(raw.orderNo ?? raw.code ?? raw.number ?? raw.id, "SO-UNKNOWN"),
    acceptedQuoteId: raw.acceptedQuoteId ?? raw.accepted_quote_id ? String(raw.acceptedQuoteId ?? raw.accepted_quote_id) : null,
    customer: display(raw.customerName ?? customer.name ?? raw.customer, "\u672a\u547d\u540d\u5ba2\u6237"),
    project: display(raw.projectName ?? project.name ?? raw.project, "\u672a\u547d\u540d\u9879\u76ee"),
    dealer: display(raw.dealerName ?? asRecord(raw.dealer).name ?? raw.dealer, "-"),
    owner: display(raw.ownerName ?? raw.assigneeName ?? raw.assignedEmployeeName ?? owner.name, "\u672a\u5206\u914d"),
    ownerUserId: raw.ownerUserId ?? raw.owner_user_id ? String(raw.ownerUserId ?? raw.owner_user_id) : null,
    assignedAt: raw.assignedAt ?? raw.assigned_at ? String(raw.assignedAt ?? raw.assigned_at) : null,
    amount: raw.amount !== undefined ? Number(raw.amount) : Number(raw.totalMinor ?? 0) / 100,
    status: status(rawStatus, orderStatus, "\u5f85\u786e\u8ba4"),
    productionStatus: status(raw.productionStatus ?? raw.production_status ?? rawStatus, productionStatus, productionFallback),
    shipmentStatus: status(raw.shipmentStatus ?? raw.shipment_status ?? rawStatus, shipmentStatus, "\u672a\u521b\u5efa"),
    dueDate: display(raw.expectedDeliveryDate ?? raw.expected_delivery_date ?? raw.dueDate ?? raw.due_date, "-"),
    customerConfirmedAt: raw.customerConfirmedAt ?? raw.customer_confirmed_at
      ? String(raw.customerConfirmedAt ?? raw.customer_confirmed_at)
      : null,
    deliveryLeadTimeDays: raw.deliveryLeadTimeDays ?? raw.delivery_lead_time_days
      ? Number(raw.deliveryLeadTimeDays ?? raw.delivery_lead_time_days)
      : null,
    createdAt: display(raw.createdAt ?? raw.created_at, "-"),
    version: Number(raw.version ?? raw.revision ?? 1)
  };
}

function normalizeEmployee(payload: unknown): FactoryEmployee {
  const raw = asRecord(payload);
  const user = asRecord(raw.user);
  const id = raw.id ?? raw.memberId ?? raw.member_id ?? user.id;
  const userId = raw.userId ?? raw.user_id ?? user.id ?? id;
  const employeeStatus = String(raw.status ?? raw.memberStatus ?? "active");
  return {
    id: display(id, createClientId()),
    userId: display(userId, createClientId()),
    name: display(raw.name ?? raw.displayName ?? user.name, "\u672a\u547d\u540d\u5458\u5de5"),
    username: raw.username ?? user.username ? String(raw.username ?? user.username) : undefined,
    email: raw.email ?? user.email ? String(raw.email ?? user.email) : null,
    phone: raw.phone ?? raw.phoneNumber ?? user.phoneNumber ? String(raw.phone ?? raw.phoneNumber ?? user.phoneNumber) : undefined,
    note: raw.note ? String(raw.note) : undefined,
    status: ["suspended", "inactive", "disabled"].includes(employeeStatus) ? "suspended" : "active",
    lastLoginAt: raw.lastLoginAt ?? raw.last_login_at ? String(raw.lastLoginAt ?? raw.last_login_at) : undefined,
    createdAt: raw.createdAt ?? raw.created_at ? String(raw.createdAt ?? raw.created_at) : undefined
  };
}

function normalizeAccount(payload: unknown): AccountSummary {
  const raw = asRecord(payload);
  return {
    id: display(raw.id, ""),
    tenantId: display(raw.tenantId ?? raw.tenant_id, ""),
    userId: display(raw.userId ?? raw.user_id, ""),
    name: display(raw.name, "未命名账号"),
    email: raw.email ? String(raw.email) : null,
    phone: raw.phone ?? raw.phoneNumber ? String(raw.phone ?? raw.phoneNumber) : null,
    role: display(raw.role, "member") as AccountSummary["role"],
    status: raw.status === "disabled" ? "disabled" : "active",
    lastActiveAt: raw.lastActiveAt ?? raw.last_active_at ? String(raw.lastActiveAt ?? raw.last_active_at) : null,
    createdAt: display(raw.createdAt ?? raw.created_at, ""),
    updatedAt: display(raw.updatedAt ?? raw.updated_at, "")
  };
}

function normalizeAccountAuthorization(payload: unknown): AccountAuthorization {
  const raw = asRecord(unwrapItem(payload));
  const grants = Array.isArray(raw.grants) ? raw.grants.flatMap((item) => {
    const grant = asRecord(item);
    const permission = typeof grant.permission === "string" ? grant.permission : "";
    if (!permission) return [];
    const scope = ["own", "assigned", "specified", "organization"].includes(String(grant.scope))
      ? String(grant.scope) as AuthorizationDataScope
      : "organization";
    const assignedUserIds = Array.isArray(grant.assignedUserIds)
      ? grant.assignedUserIds.filter((id): id is string => typeof id === "string")
      : [];
    return [{ permission, scope, assignedUserIds }];
  }) : [];
  const rawScopes = asRecord(raw.dataScopes);
  const dataScopes = Object.fromEntries(Object.entries(rawScopes).flatMap(([key, value]) => {
    const scope = asRecord(value);
    const resource = typeof scope.resource === "string" ? scope.resource : key;
    if (!resource) return [];
    const kind = ["own", "assigned", "specified", "organization"].includes(String(scope.scope))
      ? String(scope.scope) as AuthorizationDataScope
      : "organization";
    const assignedUserIds = Array.isArray(scope.assignedUserIds)
      ? scope.assignedUserIds.filter((id): id is string => typeof id === "string")
      : [];
    return [[key, { resource, scope: kind, assignedUserIds }]] as const;
  }));
  return {
    accountId: display(raw.accountId, ""),
    userId: display(raw.userId, ""),
    grants,
    effectivePermissions: Array.isArray(raw.effectivePermissions) ? raw.effectivePermissions.filter((item): item is string => typeof item === "string") : [],
    delegablePermissions: Array.isArray(raw.delegablePermissions) ? raw.delegablePermissions.filter((item): item is string => typeof item === "string") : [],
    dataScopes,
    enabledModules: Array.isArray(raw.enabledModules) ? raw.enabledModules.filter((item): item is string => typeof item === "string") : [],
    fieldPolicy: {
      price: display(asRecord(raw.fieldPolicy).price, "none"),
      inventory: String(asRecord(raw.fieldPolicy).inventory ?? "none") as AccountAuthorization["fieldPolicy"]["inventory"]
    }
  };
}

function normalizeOrganizationEntitlement(payload: unknown): OrganizationEntitlement {
  const raw = asRecord(payload);
  return {
    module: display(raw.module, ""),
    enabled: raw.enabled !== false,
    permissionAllowlist: Array.isArray(raw.permissionAllowlist)
      ? raw.permissionAllowlist.filter((item): item is string => typeof item === "string")
      : null
  };
}

function normalizeEmployeeOrderSummary(payload: unknown): EmployeeOrderSummary {
  const raw = asRecord(payload);
  const employee = asRecord(raw.employee ?? raw.user);
  const counts = asRecord(raw.statusCounts ?? raw.status_counts);
  const amountMinor = raw.totalAmountMinor ?? raw.total_amount_minor;
  return {
    employeeUserId: display(raw.employeeUserId ?? raw.employee_user_id ?? raw.userId ?? raw.user_id ?? employee.id, "unassigned"),
    employeeName: display(raw.employeeName ?? raw.employee_name ?? employee.name, "\u672a\u5206\u914d"),
    orderCount: Number(raw.totalOrders ?? raw.total_orders ?? raw.orderCount ?? raw.order_count ?? raw.total ?? 0),
    pendingConfirmation: Number(raw.pendingConfirmation ?? raw.pending_confirmation ?? raw.pending ?? counts.draft ?? 0),
    confirmed: Number(raw.confirmed ?? counts.confirmed ?? counts.technical_review ?? 0),
    readyForProduction: Number(raw.readyForProduction ?? raw.ready_for_production ?? counts.ready_for_production ?? 0),
    inProduction: Number(raw.inProduction ?? raw.in_production ?? counts.in_production ?? 0),
    readyToShip: Number(raw.readyToShip ?? raw.ready_to_ship ?? counts.ready_to_ship ?? 0),
    shipped: Number(raw.shipped ?? raw.completed ?? counts.shipped ?? counts.delivered ?? counts.completed ?? 0),
    activeAmount: amountMinor === null
      ? null
      : amountMinor === undefined
        ? (raw.activeAmount === null || raw.active_amount === null || raw.amount === null ? null : Number(raw.activeAmount ?? raw.active_amount ?? raw.amount ?? 0))
        : Number(amountMinor) / 100,
    unassignedOrderCount: raw.unassignedOrderCount === undefined && raw.unassigned_order_count === undefined
      ? undefined
      : Number(raw.unassignedOrderCount ?? raw.unassigned_order_count),
    updatedAt: raw.updatedAt ?? raw.updated_at ? String(raw.updatedAt ?? raw.updated_at) : undefined
  };
}

function normalizeEmployeeFollowUpSummary(payload: unknown): EmployeeFollowUpSummary {
  const raw = asRecord(payload);
  const employee = asRecord(raw.employee ?? raw.user);
  return {
    employeeUserId: display(raw.employeeUserId ?? raw.employee_user_id ?? raw.userId ?? raw.user_id ?? employee.id, ""),
    employeeName: display(raw.employeeName ?? raw.employee_name ?? employee.name, "\u672a\u547d\u540d\u5458\u5de5"),
    followUpCount: Number(raw.followUpCount ?? raw.follow_up_count ?? raw.count ?? 0),
    dueTodayCount: Number(raw.dueTodayCount ?? raw.due_today_count ?? raw.pendingFollowUpCount ?? raw.pending_follow_up_count ?? 0),
    overdueCount: Number(raw.overdueCount ?? raw.overdue_count ?? 0),
    latestFollowUpAt: raw.latestFollowUpAt ?? raw.latest_follow_up_at ? String(raw.latestFollowUpAt ?? raw.latest_follow_up_at) : undefined
  };
}

function normalizeOrderFollowUp(payload: unknown): OrderFollowUp {
  const raw = asRecord(payload);
  const employee = asRecord(raw.employee ?? raw.user ?? raw.author);
  return {
    id: display(raw.id, createClientId()),
    orderId: display(raw.orderId ?? raw.order_id, ""),
    employeeUserId: display(raw.employeeUserId ?? raw.employee_user_id ?? raw.authorUserId ?? raw.author_user_id ?? employee.id, ""),
    employeeName: display(raw.employeeName ?? raw.employee_name ?? raw.authorName ?? raw.author_name ?? employee.name, "\u672a\u547d\u540d\u5458\u5de5"),
    content: display(raw.content ?? raw.note, ""),
    nextFollowUpAt: raw.nextFollowUpAt ?? raw.next_follow_up_at ? String(raw.nextFollowUpAt ?? raw.next_follow_up_at) : null,
    createdAt: display(raw.createdAt ?? raw.created_at, new Date().toISOString())
  };
}

function normalizeOrderLine(payload: unknown, index: number): OrderLine {
  const raw = asRecord(payload);
  const qty = Number(raw.qty ?? raw.quantity ?? 0);
  const unitPrice = raw.unitPrice !== undefined ? Number(raw.unitPrice) : Number(raw.unitPriceMinor ?? 0) / 100;
  return {
    id: display(raw.id, "line-" + (index + 1)),
    sku: display(raw.sku ?? raw.sourceRef ?? raw.materialCode, "-"),
    description: display(raw.description ?? raw.name, "\u672a\u547d\u540d\u7269\u6599"),
    color: display(raw.color ?? asRecord(raw.metadata).color, "-"),
    qty,
    unitPrice,
    total: raw.total !== undefined ? Number(raw.total) : raw.lineTotalMinor !== undefined ? Number(raw.lineTotalMinor) / 100 : qty * unitPrice
  };
}

function normalizeProductionStep(payload: unknown, index: number): ProductionStep {
  const raw = asRecord(payload);
  const states: Record<string, ProductionStep["status"]> = {
    pending: "\u5f85\u5904\u7406",
    in_progress: "\u8fdb\u884c\u4e2d",
    completed: "\u5df2\u5b8c\u6210",
    blocked: "\u963b\u585e"
  };
  return {
    id: display(raw.id, "production-" + (index + 1)),
    name: display(raw.name ?? raw.label, "\u5de5\u5e8f " + (index + 1)),
    owner: display(raw.owner ?? raw.ownerName, "\u672a\u5206\u914d"),
    status: status(raw.status, states, "\u5f85\u5904\u7406"),
    plannedAt: display(raw.plannedAt ?? raw.planned_at, "-"),
    completedAt: raw.completedAt ?? raw.completed_at ? String(raw.completedAt ?? raw.completed_at) : undefined
  };
}

function normalizeShipment(payload: unknown): Shipment {
  const raw = asRecord(payload);
  return {
    id: display(raw.id, createClientId()),
    shipmentNo: display(raw.shipmentNo ?? raw.code ?? raw.id, "SHP-UNKNOWN"),
    carrier: display(raw.carrier, "\u5f85\u6307\u5b9a"),
    trackingNo: display(raw.trackingNo ?? raw.tracking_no, "-"),
    status: status(raw.status, shipmentStatus, "\u5f85\u63d0\u8d27"),
    packages: Number(raw.packages ?? raw.packageCount ?? 0),
    shippedAt: raw.shippedAt ?? raw.shipped_at ? String(raw.shippedAt ?? raw.shipped_at) : undefined,
    signedAt: raw.signedAt ?? raw.signed_at ? String(raw.signedAt ?? raw.signed_at) : undefined
  };
}

function normalizeWarehouse(payload: unknown): Warehouse {
  const raw = asRecord(payload);
  return { id: display(raw.id ?? raw.warehouseId, createClientId()), code: display(raw.code, "WH-UNKNOWN"), name: display(raw.name, "未命名仓库"), address: raw.address ? String(raw.address) : null, status: raw.status === "inactive" ? "inactive" : "active" };
}

function normalizeInventoryMaterial(payload: unknown, index = 0): InventoryMaterial {
  const raw = asRecord(payload);
  return {
    id: display(raw.id ?? raw.materialId, `material-${index + 1}`),
    materialKey: display(raw.materialKey ?? raw.material_key ?? raw.materialCode ?? raw.sku, `material-${index + 1}`),
    specKey: display(raw.specKey ?? raw.spec_key ?? raw.specification ?? raw.spec, "standard"),
    materialCode: display(raw.materialCode ?? raw.material_code ?? raw.sku ?? raw.materialKey, `M-${index + 1}`),
    name: display(raw.name ?? raw.materialName ?? raw.description, "未命名物料"),
    specification: display(raw.specification ?? raw.spec, "通用"),
    unit: display(raw.unit, "件"),
    category: raw.category ? String(raw.category) : undefined,
    color: raw.color ? String(raw.color) : null,
    finish: raw.finish ? String(raw.finish) : null,
    weightKg: raw.weightKg !== undefined || raw.weight_kg !== undefined ? Number(raw.weightKg ?? raw.weight_kg) : null,
    referenceCostMinor: raw.referenceCostMinor !== undefined || raw.reference_cost_minor !== undefined ? Number(raw.referenceCostMinor ?? raw.reference_cost_minor) : null,
    note: raw.note ? String(raw.note) : undefined,
    source: raw.source ? String(raw.source) : undefined,
    active: raw.active === undefined ? true : Boolean(raw.active)
  };
}

function normalizeInventoryBalance(payload: unknown, index = 0): InventoryBalance {
  const raw = asRecord(payload);
  const material = normalizeInventoryMaterial(raw.material ?? raw, index);
  return {
    id: display(raw.id, `balance-${index + 1}`),
    warehouseId: display(raw.warehouseId ?? raw.warehouse_id, "default"),
    warehouseName: raw.warehouseName ?? raw.warehouse_name ? String(raw.warehouseName ?? raw.warehouse_name) : undefined,
    materialId: raw.materialId ?? raw.material_id ? String(raw.materialId ?? raw.material_id) : undefined,
    materialKey: material.materialKey,
    specKey: display(raw.specKey ?? raw.spec_key ?? material.specKey, "standard"),
    color: raw.color ? String(raw.color) : material.color,
    finish: raw.finish ? String(raw.finish) : material.finish,
    materialCode: material.materialCode,
    name: material.name,
    specification: material.specification,
    unit: material.unit,
    onHandQty: raw.onHandQty !== undefined || raw.on_hand_qty !== undefined || raw.quantity !== undefined ? Number(raw.onHandQty ?? raw.on_hand_qty ?? raw.quantity) : null,
    availableQty: raw.availableQty !== undefined || raw.available_qty !== undefined ? Number(raw.availableQty ?? raw.available_qty) : null,
    isAvailable: typeof raw.isAvailable === "boolean" ? raw.isAvailable : typeof raw.is_available === "boolean" ? raw.is_available : null,
    reservedQty: raw.reservedQty !== undefined || raw.reserved_qty !== undefined ? Number(raw.reservedQty ?? raw.reserved_qty) : null,
    inboundQty: raw.inboundQty !== undefined || raw.inbound_qty !== undefined ? Number(raw.inboundQty ?? raw.inbound_qty) : null,
    outboundQty: raw.outboundQty !== undefined || raw.outbound_qty !== undefined ? Number(raw.outboundQty ?? raw.outbound_qty) : null,
    valueMinor: raw.valueMinor !== undefined || raw.value_minor !== undefined ? Number(raw.valueMinor ?? raw.value_minor) : null,
    updatedAt: display(raw.updatedAt ?? raw.updated_at, "-")
  };
}

function normalizeInventoryShortage(payload: unknown, index = 0): InventoryShortageAlert {
  const raw = asRecord(payload);
  const material = normalizeInventoryMaterial(raw.material ?? raw, index);
  const nullableQuantity = (camelKey: string, snakeKey: string) => {
    const value = raw[camelKey] ?? raw[snakeKey];
    return value === null || value === undefined ? null : Number(value);
  };
  const kind = String(raw.kind ?? "stock_shortage");
  const followUp = String(raw.followUp ?? raw.follow_up ?? "replenishment");
  const rawMaterialId = raw.materialId !== undefined
    ? raw.materialId
    : raw.material_id !== undefined
      ? raw.material_id
      : asRecord(raw.material).id ?? material.id;
  const rawColor = raw.color !== undefined ? raw.color : material.color;
  const rawFinish = raw.finish !== undefined ? raw.finish : material.finish;
  return {
    id: display(raw.id, `shortage-${index + 1}`),
    kind: kind === "custom_made" || kind === "depleted_stock" ? kind : "stock_shortage",
    reason: display(raw.reason, "库存不足"),
    followUp: followUp === "production" ? "production" : "replenishment",
    orderId: raw.orderId ?? raw.order_id ? String(raw.orderId ?? raw.order_id) : null,
    orderCode: raw.orderCode ?? raw.order_code ? String(raw.orderCode ?? raw.order_code) : null,
    orderStatus: raw.orderStatus ?? raw.order_status ? String(raw.orderStatus ?? raw.order_status) : null,
    materialId: nullableDisplay(rawMaterialId),
    materialKey: display(raw.materialKey ?? raw.material_key ?? material.materialKey, material.materialKey),
    specKey: display(raw.specKey ?? raw.spec_key ?? material.specKey, material.specKey),
    materialCode: display(raw.materialCode ?? raw.material_code ?? material.materialCode, material.materialCode),
    name: display(raw.name ?? raw.materialName ?? raw.material_name ?? material.name, material.name),
    specification: display(raw.specification ?? raw.spec ?? material.specification, material.specification),
    color: nullableDisplay(rawColor),
    finish: nullableDisplay(rawFinish),
    unit: display(raw.unit ?? material.unit, material.unit),
    officialSkuCode: raw.officialSkuCode ?? raw.official_sku_code ? String(raw.officialSkuCode ?? raw.official_sku_code) : null,
    requiredQty: nullableQuantity("requiredQty", "required_qty"),
    reservedQty: nullableQuantity("reservedQty", "reserved_qty"),
    issuedQty: nullableQuantity("issuedQty", "issued_qty"),
    availableQty: nullableQuantity("availableQty", "available_qty"),
    shortageQty: nullableQuantity("shortageQty", "shortage_qty"),
    createdAt: display(raw.createdAt ?? raw.created_at, "-"),
    updatedAt: display(raw.updatedAt ?? raw.updated_at, "-")
  };
}

function normalizeInventoryLedger(payload: unknown, index = 0): InventoryLedgerEntry {
  const raw = asRecord(payload);
  const material = normalizeInventoryMaterial(raw.material ?? raw, index);
  const type = String(raw.documentType ?? raw.document_type ?? raw.type ?? "inbound");
  const direction = raw.direction === "out" || ["outbound", "issue"].includes(type) ? "out" as const : "in" as const;
  return {
    id: display(raw.id, `ledger-${index + 1}`),
    documentNo: display(raw.documentNo ?? raw.document_no ?? raw.number, `STK-${index + 1}`),
    documentType: type,
    status: raw.status ? String(raw.status) : undefined,
    warehouseId: display(raw.warehouseId ?? raw.warehouse_id, "default"),
    warehouseName: raw.warehouseName ?? raw.warehouse_name ? String(raw.warehouseName ?? raw.warehouse_name) : undefined,
    materialId: raw.materialId ?? raw.material_id ? String(raw.materialId ?? raw.material_id) : undefined,
    materialKey: material.materialKey,
    specKey: display(raw.specKey ?? raw.spec_key ?? material.specKey, "standard"),
    color: raw.color ? String(raw.color) : material.color,
    finish: raw.finish ? String(raw.finish) : material.finish,
    materialCode: material.materialCode,
    name: material.name,
    specification: material.specification,
    unit: material.unit,
    quantity: Number(raw.quantity ?? raw.qty ?? 0),
    direction,
    reference: raw.reference ?? raw.referenceNo ?? raw.reference_no ? String(raw.reference ?? raw.referenceNo ?? raw.reference_no) : null,
    operatorName: raw.operatorName ?? raw.operator_name ? String(raw.operatorName ?? raw.operator_name) : null,
    occurredAt: display(raw.occurredAt ?? raw.occurred_at ?? raw.createdAt ?? raw.created_at, new Date().toISOString()),
    note: raw.note ? String(raw.note) : null
  };
}

function normalizeStockDocument(payload: unknown, index = 0): StockDocument {
  const raw = asRecord(payload);
  const lines = Array.isArray(raw.lines ?? raw.items) ? (raw.lines ?? raw.items) as unknown[] : [];
  return {
    id: display(raw.id, `stock-document-${index + 1}`),
    documentNo: display(raw.documentNo ?? raw.document_no ?? raw.number ?? raw.code, `STK-${index + 1}`),
    documentType: String(raw.documentType ?? raw.document_type ?? raw.type ?? "inbound"),
    status: String(raw.status ?? "draft"),
    warehouseId: display(raw.warehouseId ?? raw.warehouse_id, "default"),
    warehouseName: raw.warehouseName ?? raw.warehouse_name ? String(raw.warehouseName ?? raw.warehouse_name) : undefined,
    reference: raw.reference ?? raw.referenceNo ?? raw.reference_no ? String(raw.reference ?? raw.referenceNo ?? raw.reference_no) : null,
    note: raw.note ? String(raw.note) : null,
    lines: lines.map((item) => { const line = asRecord(item); return { materialId: line.materialId ?? line.material_id ? String(line.materialId ?? line.material_id) : undefined, materialKey: display(line.materialKey ?? line.material_key ?? line.materialCode, ""), specKey: line.specKey ?? line.spec_key ? String(line.specKey ?? line.spec_key) : undefined, color: line.color ? String(line.color) : null, finish: line.finish ? String(line.finish) : null, materialCode: line.materialCode ? String(line.materialCode) : undefined, name: line.name ? String(line.name) : undefined, specification: line.specification ?? line.specKey ?? line.spec ? String(line.specification ?? line.specKey ?? line.spec) : undefined, unit: line.unit ? String(line.unit) : undefined, quantity: Number(line.quantity ?? line.qty ?? 0) }; }),
    createdAt: display(raw.createdAt ?? raw.created_at, new Date().toISOString()),
    postedAt: raw.postedAt ?? raw.posted_at ? String(raw.postedAt ?? raw.posted_at) : null
  };
}

function normalizeInventoryRequirement(payload: unknown, index = 0): InventoryRequirement {
  const raw = asRecord(payload);
  const material = normalizeInventoryMaterial(raw.material ?? raw, index);
  return { id: display(raw.id, `requirement-${index + 1}`), orderId: raw.orderId ?? raw.order_id ? String(raw.orderId ?? raw.order_id) : undefined, materialId: raw.materialId ?? raw.material_id ? String(raw.materialId ?? raw.material_id) : material.id, materialKey: material.materialKey, specKey: raw.specKey ?? raw.spec_key ? String(raw.specKey ?? raw.spec_key) : material.specKey, color: raw.color ?? material.color ?? null, finish: raw.finish ?? material.finish ?? null, materialCode: material.materialCode, name: material.name, specification: material.specification, unit: material.unit, requiredQty: Number(raw.requiredQty ?? raw.required_qty ?? raw.quantity ?? raw.qty ?? 0), reservedQty: Number(raw.reservedQty ?? raw.reserved_qty ?? 0), issuedQty: Number(raw.issuedQty ?? raw.issued_qty ?? 0), availableQty: raw.availableQty !== undefined || raw.available_qty !== undefined ? Number(raw.availableQty ?? raw.available_qty) : null, status: String(raw.status ?? "unreserved") };
}

function normalizeOrderDetail(payload: unknown): OrderDetail {
  const raw = asRecord(payload);
  const snapshot = asRecord(raw.snapshot ?? raw.orderSnapshot);
  const frozenQuote = asRecord(snapshot.quote);
  const lines = raw.lines ?? snapshot.lines ?? [];
  const production = raw.production ?? raw.productionSteps ?? snapshot.production ?? [];
  return {
    ...normalizeOrder(raw),
    quoteNo: display(raw.quoteNo ?? asRecord(raw.quote).quoteNo, "-"),
    poNumber: display(raw.poNumber ?? raw.po_number, "-"),
    address: display(raw.address ?? raw.shippingAddress, "-"),
    contact: display(raw.contact, "-"),
    phone: display(raw.phone, "-"),
    note: display(raw.note ?? raw.productionNote ?? raw.shippingNote, ""),
    quoteNote: display(frozenQuote.notes, ""),
    configuration: projectOrderConfiguration(raw),
    lines: Array.isArray(lines) ? lines.map(normalizeOrderLine) : [],
    production: Array.isArray(production) ? production.map(normalizeProductionStep) : [],
    shipments: Array.isArray(raw.shipments) ? raw.shipments.map(normalizeShipment) : []
  };
}

function normalizeDealer(payload: unknown): Dealer {
  const raw = asRecord(payload);
  const levels: Record<string, Dealer["level"]> = {
    core: "\u6838\u5fc3",
    standard: "\u6807\u51c6",
    watch: "\u89c2\u5bdf"
  };
  return {
    id: display(raw.id, createClientId()),
    code: display(raw.code ?? raw.id, "DLR-UNKNOWN"),
    name: display(raw.name, "\u672a\u547d\u540d\u7ecf\u9500\u5546"),
    region: display(raw.region, "-"),
    contact: display(raw.contact ?? raw.contactName, "-"),
    phone: raw.phone ? String(raw.phone) : null,
    email: raw.email ? String(raw.email) : null,
    level: status(raw.level, levels, "\u6807\u51c6"),
    discountRate: Number(raw.discountRate ?? raw.discount ?? 90),
    status: raw.status === "suspended" ? "\u6682\u505c" : "\u542f\u7528",
    lastActiveAt: display(raw.lastActiveAt ?? raw.last_active_at, "-")
  };
}

function normalizePriceList(payload: unknown): PriceList {
  const raw = asRecord(payload);
  return {
    id: display(raw.id, createClientId()),
    name: display(raw.name, "\u672a\u547d\u540d\u4ef7\u683c\u8868"),
    code: display(raw.code ?? raw.id, "PL-UNKNOWN"),
    market: display(raw.market, "\u4e2d\u56fd\u5927\u9646"),
    currency: (raw.currency ?? "CNY") as PriceList["currency"],
    version: display(raw.version ?? raw.revision, "-"),
    itemCount: Number(raw.itemCount ?? raw.item_count ?? 0),
    effectiveFrom: display(raw.effectiveFrom ?? raw.effective_from, "-"),
    status: (raw.status === "active" ? "\u751f\u6548\u4e2d" : raw.status === "expired" ? "\u5df2\u8fc7\u671f" : raw.status === "archived" ? "\u5df2\u5f52\u6863" : "\u8349\u7a3f") as PriceList["status"],
    updatedAt: display(raw.updatedAt ?? raw.updated_at, "-")
  };
}

function normalizePriceListItem(payload: unknown, priceListId: string, index: number): PriceListItem {
  const raw = asRecord(payload);
  const categories: Record<string, PriceListItem["category"]> = {
    frame: "\u6846\u67b6\u7ba1\u4ef6",
    panel: "\u677f\u4ef6",
    door: "\u95e8\u7c7b",
    interior: "\u5185\u90e8\u914d\u4ef6",
    accessory: "\u5185\u90e8\u914d\u4ef6",
    glass: "\u73bb\u7483",
    hardware: "\u4e94\u91d1\u4e0e\u652f\u6491"
  };
  const retail = raw.retailUnitPriceMinor ?? raw.retail_unit_price_minor ?? raw.retailPriceMinor ?? raw.retail_price_minor ?? raw.priceMinor ?? raw.unitPriceMinor;
  const previous = raw.previousRetailPriceMinor ?? raw.previous_retail_price_minor ?? raw.previousPriceMinor;
  return {
    id: display(raw.id, "price-item-" + (index + 1)),
    priceListId: display(raw.priceListId ?? raw.price_list_id, priceListId),
    materialKey: display(raw.materialKey ?? raw.material_key ?? raw.materialCode ?? raw.sku, "material-" + (index + 1)),
    specKey: display(raw.specKey ?? raw.spec_key ?? raw.specification, "default"),
    category: status(raw.category, categories, "\u5185\u90e8\u914d\u4ef6"),
    materialCode: display(raw.materialCode ?? raw.material_code ?? raw.sku ?? raw.sourceRef ?? raw.materialKey, "M-" + (index + 1)),
    name: display(raw.name ?? raw.materialName ?? raw.description, "\u672a\u547d\u540d\u96f6\u4ef6"),
    specification: display(raw.specification ?? raw.spec, "\u901a\u7528"),
    unit: display(raw.unit, "\u4ef6"),
    pricingMethod: (raw.pricingMethod ?? raw.pricing_method ?? "fixed") as PriceListItem["pricingMethod"],
    retailPriceMinor: retail === null || retail === undefined || retail === "" ? null : Number(retail),
    previousRetailPriceMinor: previous === null || previous === undefined || previous === "" ? null : Number(previous),
    rule: raw.pricingRule && typeof raw.pricingRule === "object" ? raw.pricingRule as Record<string, unknown> : raw.rule && typeof raw.rule === "object" ? raw.rule as Record<string, unknown> : null,
    remark: display(raw.remark ?? raw.note, ""),
    source: raw.source === "manual" ? "manual" : "bom",
    usesFallbackPrice: Boolean(raw.usesFallbackPrice ?? raw.uses_fallback_price),
    updatedAt: display(raw.updatedAt ?? raw.updated_at, "-")
  };
}

function normalizePriceListDetail(payload: unknown): PriceListDetail {
  const raw = asRecord(payload);
  const source = asRecord(raw.priceList ?? raw.price_list ?? raw.item ?? raw.data ?? raw);
  const sourceItems = raw.items ?? source.items;
  const items = Array.isArray(sourceItems) ? sourceItems.map((item, index) => normalizePriceListItem(item, display(source.id, ""), index)) : [];
  return {
    ...normalizePriceList(source),
    effectiveTo: source.effectiveTo ?? source.effective_to ? String(source.effectiveTo ?? source.effective_to) : null,
    publishedBy: source.publishedBy ?? source.published_by ? String(source.publishedBy ?? source.published_by) : null,
    publishedAt: source.publishedAt ?? source.published_at ? String(source.publishedAt ?? source.published_at) : null,
    itemCount: Number(source.itemCount ?? source.item_count ?? items.length),
    items
  };
}

function normalizePriceListMutation(payload: unknown): PriceListDetail {
  if (Array.isArray(payload)) {
    const items = payload.map((item, index) => normalizePriceListItem(item, display(asRecord(item).priceListId, ""), index));
    return { ...normalizePriceList({}), items, itemCount: items.length };
  }
  return normalizePriceListDetail(payload);
}

function normalizePriceListValidation(payload: unknown): PriceListValidationResult {
  const raw = asRecord(payload);
  const source = raw.issues ?? raw.errors ?? [];
  const issues = Array.isArray(source) ? source.map((value) => {
    const issue = asRecord(value);
    return {
      code: display(issue.code, "VALIDATION_ERROR"),
      message: display(issue.message ?? issue.detail, "Price list validation failed"),
      itemId: issue.itemId ?? issue.item_id ? String(issue.itemId ?? issue.item_id) : undefined,
      materialKey: issue.materialKey ?? issue.material_key ? String(issue.materialKey ?? issue.material_key) : undefined,
      severity: issue.severity === "warning" ? "warning" as const : "error" as const
    };
  }) : [];
  return {
    valid: Boolean(raw.valid ?? raw.ok ?? issues.every((issue) => issue.severity !== "error")),
    issues,
    checkedAt: display(raw.checkedAt ?? raw.checked_at, new Date().toISOString())
  };
}

function normalizeAudit(payload: unknown): AuditEvent {
  const raw = asRecord(payload);
  return {
    id: display(raw.id, createClientId()),
    actor: display(raw.actorName ?? raw.actor, "\u7cfb\u7edf"),
    role: display(raw.role, "\u7cfb\u7edf"),
    action: display(raw.action ?? raw.event, "\u64cd\u4f5c"),
    resource: display(raw.resource ?? raw.entity, "\u5bf9\u8c61"),
    resourceId: display(raw.resourceId ?? raw.entityId, "-"),
    tenant: display(raw.tenantName ?? raw.tenant, "\u5f53\u524d\u7ec4\u7ec7"),
    createdAt: display(raw.createdAt ?? raw.created_at, "-"),
    ip: display(raw.ip, "internal"),
    detail: display(raw.detail ?? raw.message, "-")
  };
}

function minorAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount / 100 : null;
}

function normalizeQuoteAdjustmentAudit(payload: unknown): QuoteAdjustmentAudit {
  const raw = asRecord(payload);
  const metadata = asRecord(raw.metadata);
  const before = asRecord(raw.before);
  const after = asRecord(raw.after);
  const afterTerms = asRecord(asRecord(after.snapshot).quoteTerms ?? raw.quoteTerms);
  return {
    id: display(raw.id, createClientId()),
    action: display(raw.action, "quote.updated"),
    actor: display(raw.actorName ?? metadata.adjustedByName ?? raw.actor ?? raw.actorUserId, "系统"),
    createdAt: display(raw.createdAt ?? raw.created_at, "-"),
    suggestedAmount: minorAmount(metadata.suggestedRetailTotalMinor ?? afterTerms.suggestedRetailTotalMinor),
    previousAmount: minorAmount(metadata.previousTotalMinor ?? before.totalMinor),
    finalAmount: minorAmount(metadata.finalQuoteTotalMinor ?? metadata.manualTotalMinor ?? after.totalMinor),
    reason: display(metadata.adjustmentReason ?? metadata.reason ?? afterTerms.adjustmentReason, "未填写原因"),
    note: metadata.quoteNote === null || metadata.quoteNote === undefined
      ? after.notes === null || after.notes === undefined || String(after.notes).trim() === "" ? null : String(after.notes)
      : String(metadata.quoteNote),
    basePriceAmount: minorAmount(raw.basePriceTotalMinor ?? raw.base_price_total_minor ?? metadata.basePriceTotalMinor ?? afterTerms.basePriceTotalMinor ?? afterTerms.suggestedRetailTotalMinor),
    salesMultiplierBasisPoints: raw.salesMultiplierBasisPoints ?? raw.sales_multiplier_basis_points ?? metadata.salesMultiplierBasisPoints ?? afterTerms.salesMultiplierBasisPoints
      ? Number(raw.salesMultiplierBasisPoints ?? raw.sales_multiplier_basis_points ?? metadata.salesMultiplierBasisPoints ?? afterTerms.salesMultiplierBasisPoints)
      : null,
    multiplierQuoteAmount: minorAmount(raw.multiplierQuoteTotalMinor ?? raw.multiplier_quote_total_minor ?? metadata.multiplierQuoteTotalMinor ?? afterTerms.multiplierQuoteTotalMinor),
    priceListId: nullableDisplay(raw.priceListId ?? raw.price_list_id ?? metadata.priceListId ?? afterTerms.priceListId),
    priceListVersion: nullableDisplay(raw.priceListVersion ?? raw.price_list_version ?? metadata.priceListVersion ?? afterTerms.priceListVersion)
  };
}

function normalizeWorkspacePayload(resource: string, payload: unknown): unknown[] {
  const list = unwrapList<unknown>(payload);
  if (resource === "projects") return list.map(normalizeProject);
  if (resource === "templates") return list.map(normalizeTemplate);
  if (resource === "quotes") return list.map(normalizeQuote);
  if (resource === "orders") return list.map(normalizeOrder);
  if (resource === "dealers") return list.map(normalizeDealer);
  if (resource === "price-lists") return list.map(normalizePriceList);
  return list.map(normalizeAudit);
}

function normalizeSession(payload: unknown): Session | null {
  const raw = asRecord(payload);
  const user = asRecord(raw.user ?? asRecord(raw.data).user);
  if (!user.id || raw.authenticated === false) return null;
  const tenant = asRecord(raw.tenant);
  const source = raw.organizations ?? raw.tenants ?? (tenant.id ? [tenant] : []);
  const tenants = Array.isArray(source) ? source.map((item) => {
    const organization = asRecord(item);
    return {
      id: display(organization.id, ""),
      name: display(organization.name, "\u672a\u547d\u540d\u7ec4\u7ec7"),
      code: display(organization.slug ?? organization.code ?? organization.id, ""),
      plan: display(organization.plan, "\u6807\u51c6")
    };
  }) : [];
  const activeTenantId = display(raw.activeOrganizationId ?? raw.activeTenantId ?? tenant.id ?? tenants[0]?.id, "default");
  const permissions = Array.isArray(raw.permissions)
    ? raw.permissions.filter((permission): permission is string => typeof permission === "string")
    : [];
  const effectivePermissions = Array.isArray(raw.effectivePermissions)
    ? raw.effectivePermissions.filter((permission): permission is string => typeof permission === "string")
    : permissions;
  const rawFieldPolicy = asRecord(raw.fieldPolicy ?? asRecord(raw.data).fieldPolicy);
  const roles: Record<string, Session["user"]["role"]> = {
    owner: "owner",
    admin: "admin",
    headquarters_admin: "admin",
    finance: "finance",
    sales: "sales",
    headquarters_sales: "sales",
    headquarters_reviewer: "sales",
    production: "production",
    production_shipping: "production",
    dealer: "dealer",
    dealer_admin: "dealer",
    dealer_designer_sales: "dealer",
    factory_employee: "factory_employee",
    employee: "factory_employee"
  };
  return {
    user: {
      id: String(user.id),
      name: display(user.name ?? user.email, "\u7528\u6237"),
      email: display(user.email, ""),
      role: roles[String(raw.role ?? asRecord(raw.membership).role ?? user.role ?? "sales")] ?? "sales"
    },
    tenants: tenants.length ? tenants : [{ id: activeTenantId, name: "\u9ed8\u8ba4\u7ec4\u7ec7", code: "DEFAULT", plan: "\u6807\u51c6" }],
    activeTenantId,
    principalType: raw.principalType === "platform_admin" || raw.principalType === "organization_member" ? raw.principalType : undefined,
    authorizationOrganizationId: raw.authorizationOrganizationId ? String(raw.authorizationOrganizationId) : undefined,
    dataOrganizationId: raw.dataOrganizationId ? String(raw.dataOrganizationId) : activeTenantId,
    permissions: effectivePermissions,
    effectivePermissions,
    delegablePermissions: Array.isArray(raw.delegablePermissions)
      ? raw.delegablePermissions.filter((permission): permission is string => typeof permission === "string")
      : [],
    dataScopes: asRecord(raw.dataScopes) as Session["dataScopes"],
    enabledModules: Array.isArray(raw.enabledModules) ? raw.enabledModules.filter((item): item is string => typeof item === "string") : [],
    fieldPolicy: {
      price: String(rawFieldPolicy.price ?? "none"),
      inventory: String(rawFieldPolicy.inventory ?? "none") as NonNullable<Session["fieldPolicy"]>["inventory"]
    },
    mustChangePassword: Boolean(raw.mustChangePassword ?? raw.must_change_password ?? raw.passwordChangeRequired ?? raw.password_change_required),
    passwordChangeRequired: Boolean(raw.passwordChangeRequired ?? raw.password_change_required ?? raw.mustChangePassword ?? raw.must_change_password),
    mode: "live"
  };
}

export const api = {
  async signIn(account: string, password: string): Promise<Session> {
    const normalized = account.trim();
    const phoneNumber = normalizeLoginPhone(normalized);
    await request<unknown>(phoneNumber ? "/auth/sign-in/phone-number" : normalized.includes("@") ? "/auth/sign-in/email" : "/auth/sign-in/username", {
      method: "POST",
      body: phoneNumber ? { phoneNumber, password } : normalized.includes("@") ? { email: normalized, password } : { username: normalized, password }
    });
    const current = await this.getSession();
    if (!current) throw new ApiError("Signed in but could not read the account session.", 500, "INVALID_SESSION");
    return current;
  },

  async getSession(tenantId?: string): Promise<Session | null> {
    try {
      return normalizeSession(await request<unknown>("/session", { tenantId }));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },

  signOut() {
    return request<unknown>("/auth/sign-out", { method: "POST" });
  },

  changePassword(currentPassword: string, newPassword: string) {
    if (newPassword.length < PASSWORD_MIN_LENGTH || newPassword.length > PASSWORD_MAX_LENGTH) {
      return Promise.reject(new ApiError(`New password must be ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters.`, 400, "PASSWORD_POLICY"));
    }
    return request<unknown>("/me/change-password", {
      method: "POST",
      body: { currentPassword, newPassword, revokeOtherSessions: true }
    });
  },

  resetAccountPassword(accountId: string, newPassword: string, tenantId: string, idempotencyKey = createClientId()) {
    if (newPassword.length < PASSWORD_MIN_LENGTH || newPassword.length > PASSWORD_MAX_LENGTH) {
      return Promise.reject(new ApiError(`New password must be ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters.`, 400, "PASSWORD_POLICY"));
    }
    return request<unknown>(`/accounts/${accountId}/reset-password`, {
      method: "POST",
      tenantId,
      idempotencyKey,
      body: { newPassword }
    });
  },

  async loadWorkspace(tenantId: string, options: { ordersOnly?: boolean } = {}): Promise<WorkspaceData> {
    const resources = options.ordersOnly
      ? ["orders"]
      : ["projects", "templates", "quotes", "orders", "dealers", "price-lists", "audit-logs"];
    const keys: Array<keyof WorkspaceData> = options.ordersOnly
      ? ["orders"]
      : ["projects", "templates", "quotes", "orders", "dealers", "priceLists", "audits"];
    const result: WorkspaceData = { projects: [], templates: [], quotes: [], orders: [], dealers: [], priceLists: [], audits: [] };
    const responses = await Promise.allSettled(resources.map((resource) => request<unknown>("/" + resource, { tenantId })));
    responses.forEach((response, index) => {
      if (response.status === "fulfilled") {
        (result as unknown as Record<string, unknown>)[keys[index]] = normalizeWorkspacePayload(resources[index], response.value);
      }
    });
    if (result.quotes.length && result.orders.length) {
      const orderQuoteIds = new Set(result.orders.map((order) => order.acceptedQuoteId).filter((id): id is string => Boolean(id)));
      if (orderQuoteIds.size) {
        result.quotes = result.quotes.map((quote) => orderQuoteIds.has(quote.id) ? { ...quote, status: "已转订单" } : quote);
      }
    }
    if (!responses.some((response) => response.status === "fulfilled")) {
      const rejected = responses.find((response): response is PromiseRejectedResult => response.status === "rejected");
      throw rejected?.reason ?? new ApiError("Unable to load workspace data.");
    }
    return result;
  },

  listSavedDesignDrafts(tenantId: string): Promise<SavedDesignDraft[]> {
    return request<unknown>("/designs", { tenantId }).then((payload) => unwrapList(payload).map(normalizeSavedDesignDraft));
  },

  updateQuote(quoteId: string, input: QuoteMutationInput, tenantId: string, expectedVersion: number): Promise<Quote> {
    return request<unknown>("/quotes/" + quoteId, {
      method: "PATCH",
      tenantId,
      expectedVersion,
      body: input
    }).then((payload) => normalizeQuote(unwrapItem(payload)));
  },

  createProjectQuote(projectId: string, input: QuoteMutationInput, tenantId: string): Promise<Quote> {
    return request<unknown>("/projects/" + projectId + "/quote", {
      method: "POST",
      tenantId,
      body: input
    }).then((payload) => normalizeQuote(unwrapItem(payload)));
  },

  listQuoteAdjustmentAudits(quoteId: string, tenantId: string): Promise<QuoteAdjustmentAudit[]> {
    const query = new URLSearchParams({ entityType: "quote", entityId: quoteId });
    return request<unknown>("/audit-logs?" + query.toString(), { tenantId })
      .then((payload) => unwrapList(payload).map(normalizeQuoteAdjustmentAudit).filter((item) => item.action === "quote.updated"));
  },

  listProjectQuoteHistory(projectId: string, tenantId: string): Promise<QuoteAdjustmentAudit[]> {
    return request<unknown>("/projects/" + projectId + "/quote-history", { tenantId })
      .then((payload) => unwrapList(payload).map(normalizeQuoteAdjustmentAudit));
  },

  getOrder(orderId: string, tenantId: string): Promise<OrderDetail> {
    return request<unknown>("/orders/" + orderId, { tenantId }).then((payload) => normalizeOrderDetail(unwrapItem(payload)));
  },

  transitionOrder(orderId: string, action: string, tenantId: string, expectedVersion: number): Promise<OrderDetail> {
    return request<unknown>("/orders/" + orderId + "/transitions", {
      method: "POST",
      tenantId,
      expectedVersion,
      body: { to: action }
    }).then((payload) => normalizeOrderDetail(unwrapItem(payload)));
  },

  updateOrderDeliverySchedule(orderId: string, deliveryLeadTimeDays: number, tenantId: string, expectedVersion: number): Promise<OrderDetail> {
    return request<unknown>("/orders/" + orderId + "/delivery-schedule", {
      method: "PATCH",
      tenantId,
      expectedVersion,
      body: { deliveryLeadTimeDays }
    }).then((payload) => normalizeOrderDetail(unwrapItem(payload)));
  },

  transitionQuote(quoteId: string, action: string, tenantId: string, expectedVersion: number) {
    return request<unknown>("/quotes/" + quoteId + "/transitions", {
      method: "POST",
      tenantId,
      expectedVersion,
      body: { to: action }
    });
  },

  createDealer(input: Pick<Dealer, "name" | "region" | "phone" | "email" | "level" | "discountRate"> & { password: string }, tenantId: string, idempotencyKey = createClientId()): Promise<Dealer> {
    const level = ({ "\u6838\u5fc3": "core", "\u6807\u51c6": "standard", "\u89c2\u5bdf": "watch" } as const)[input.level];
    return request<unknown>("/dealers", {
      method: "POST",
      tenantId,
      idempotencyKey,
      body: { name: input.name, region: input.region, phone: input.phone, email: input.email ?? undefined, password: input.password, level, discountRate: input.discountRate }
    }).then((payload) => normalizeDealer(unwrapItem(payload)));
  },

  createPriceList(priceList: PriceList, tenantId: string, idempotencyKey = createClientId()): Promise<PriceList> {
    return request<unknown>("/price-lists", {
      method: "POST",
      tenantId,
      idempotencyKey,
      body: { name: priceList.name, code: priceList.code, market: priceList.market, currency: priceList.currency, version: priceList.version, effectiveFrom: priceList.effectiveFrom }
    }).then((payload) => normalizePriceList(unwrapItem(payload)));
  },

  getPriceList(priceListId: string, tenantId: string): Promise<PriceListDetail> {
    return request<unknown>("/price-lists/" + priceListId, { tenantId }).then(normalizePriceListDetail);
  },

  exportPriceList(priceListId: string, tenantId: string): Promise<string> {
    return request<string>("/price-lists/" + priceListId + "/export", { tenantId });
  },

  savePriceListItems(priceListId: string, items: PriceListItem[], tenantId: string, idempotencyKey = createClientId()): Promise<PriceListDetail> {
    const categories = {
      "\u6846\u67b6\u7ba1\u4ef6": "frame",
      "\u677f\u4ef6": "panel",
      "\u95e8\u7c7b": "door",
      "\u5185\u90e8\u914d\u4ef6": "interior",
      "\u73bb\u7483": "glass",
      "\u4e94\u91d1\u4e0e\u652f\u6491": "hardware"
    } as const;
    return request<unknown>("/price-lists/" + priceListId + "/items", {
      method: "PUT",
      tenantId,
      idempotencyKey,
      body: {
        items: items.map((item) => ({
          id: item.id,
          materialKey: item.materialKey,
          specKey: item.specKey,
          category: categories[item.category] ?? "hardware",
          materialCode: item.materialCode,
          name: item.name,
          specification: item.specification,
          unit: item.unit,
          pricingMethod: item.pricingMethod,
          retailUnitPriceMinor: item.retailPriceMinor,
          pricingRule: item.rule,
          note: item.remark,
          sourceRef: item.materialCode
        }))
      }
    }).then(normalizePriceListMutation);
  },

  previewPriceListImport(priceListId: string, rows: unknown[], tenantId: string, idempotencyKey = createClientId()) {
    return request<unknown>("/price-lists/" + priceListId + "/import/preview", {
      method: "POST",
      tenantId,
      idempotencyKey,
      body: { mode: "incremental", rows }
    });
  },

  commitPriceListImport(priceListId: string, input: { rows: unknown[]; previewToken?: string }, tenantId: string, idempotencyKey = createClientId()) {
    return request<unknown>("/price-lists/" + priceListId + "/import/commit", {
      method: "POST",
      tenantId,
      idempotencyKey,
      body: { mode: "incremental", ...input }
    }).then(normalizePriceListDetail);
  },

  syncPriceListBom(priceListId: string, tenantId: string, idempotencyKey = createClientId()): Promise<PriceListDetail> {
    return request<unknown>("/price-lists/" + priceListId + "/sync-bom", { method: "POST", tenantId, idempotencyKey }).then(normalizePriceListMutation);
  },

  validatePriceList(priceListId: string, tenantId: string, idempotencyKey = createClientId()): Promise<PriceListValidationResult> {
    return request<unknown>("/price-lists/" + priceListId + "/validate", { method: "POST", tenantId, idempotencyKey }).then(normalizePriceListValidation);
  },

  publishPriceList(priceListId: string, effectiveFrom: string, tenantId: string, idempotencyKey = createClientId()): Promise<PriceListDetail> {
    return request<unknown>("/price-lists/" + priceListId + "/publish", {
      method: "POST",
      tenantId,
      idempotencyKey,
      body: { effectiveFrom }
    }).then(normalizePriceListDetail);
  },

  clonePriceList(priceListId: string, tenantId: string, idempotencyKey = createClientId()): Promise<PriceList> {
    return request<unknown>("/price-lists/" + priceListId + "/clone", {
      method: "POST",
      tenantId,
      idempotencyKey,
      body: {}
    }).then((payload) => normalizePriceList(unwrapItem(payload)));
  },

  createOrderFromQuote(quoteId: string, tenantId: string, idempotencyKey = createClientId()): Promise<Order> {
    return request<unknown>("/orders", {
      method: "POST",
      tenantId,
      idempotencyKey,
      body: { acceptedQuoteId: quoteId }
    }).then((payload) => normalizeOrder(unwrapItem(payload)));
  },

  createShipment(input: CreateShipmentInput, tenantId: string, idempotencyKey = createClientId()): Promise<Shipment> {
    return request<unknown>("/shipments", {
      method: "POST",
      tenantId,
      idempotencyKey,
      body: input
    }).then((payload) => normalizeShipment(unwrapItem(payload)));
  },

  listEmployees(tenantId: string): Promise<FactoryEmployee[]> {
    return request<unknown>("/employees", { tenantId }).then((payload) => unwrapList<unknown>(payload).map(normalizeEmployee));
  },

  listAccounts(tenantId: string): Promise<AccountSummary[]> {
    return request<unknown>("/accounts", { tenantId }).then((payload) => unwrapList<unknown>(payload).map(normalizeAccount));
  },

  createEmployee(input: { name: string; phone: string; email?: string; password: string }, tenantId: string, idempotencyKey = createClientId()): Promise<FactoryEmployee> {
    return request<unknown>("/employees", {
      method: "POST",
      tenantId,
      idempotencyKey,
      body: input
    }).then((payload) => normalizeEmployee(unwrapItem(payload)));
  },

  createOrganizationAdmin(input: { name: string; phone: string; email?: string; password: string }, tenantId: string, idempotencyKey = createClientId()): Promise<AccountSummary> {
    return request<unknown>("/organization/admins", {
      method: "POST",
      tenantId,
      idempotencyKey,
      body: input
    }).then((payload) => normalizeAccount(unwrapItem(payload)));
  },

  setEmployeeStatus(employeeId: string, employeeStatus: FactoryEmployee["status"], tenantId: string, idempotencyKey = createClientId()): Promise<FactoryEmployee> {
    return request<unknown>("/employees/" + employeeId + "/status", {
      method: "PATCH",
      tenantId,
      idempotencyKey,
      body: { status: employeeStatus === "suspended" ? "disabled" : "active" }
    }).then((payload) => normalizeEmployee(unwrapItem(payload)));
  },

  setAccountStatus(accountId: string, status: AccountSummary["status"], tenantId: string, idempotencyKey = createClientId()): Promise<AccountSummary> {
    return request<unknown>(`/accounts/${accountId}/status`, {
      method: "PATCH",
      tenantId,
      idempotencyKey,
      body: { status }
    }).then((payload) => normalizeAccount(unwrapItem(payload)));
  },

  getAccountAuthorization(accountId: string, tenantId: string): Promise<AccountAuthorization> {
    return request<unknown>(`/accounts/${accountId}/authorization`, { tenantId }).then(normalizeAccountAuthorization);
  },

  updateAccountAuthorization(accountId: string, input: { grants: PermissionGrant[]; dataScopes?: Array<{ resource: string; scope: AuthorizationDataScope; assignedUserIds: string[] }> }, tenantId: string, idempotencyKey = createClientId()): Promise<AccountAuthorization> {
    return request<unknown>(`/accounts/${accountId}/authorization`, {
      method: "PUT",
      tenantId,
      idempotencyKey,
      body: { grants: input.grants, dataScopes: input.dataScopes ?? [] }
    }).then(normalizeAccountAuthorization);
  },

  previewAccountAuthorization(accountId: string, input: { grants: PermissionGrant[]; dataScopes?: Array<{ resource: string; scope: AuthorizationDataScope; assignedUserIds: string[] }> }, tenantId: string): Promise<AccountAuthorization> {
    return request<unknown>(`/accounts/${accountId}/authorization/preview`, {
      method: "POST",
      tenantId,
      body: { grants: input.grants, dataScopes: input.dataScopes ?? [] }
    }).then(normalizeAccountAuthorization);
  },

  copyAccountAuthorization(accountId: string, sourceAccountId: string, tenantId: string): Promise<AccountAuthorization> {
    return request<unknown>(`/accounts/${accountId}/authorization/copy`, {
      method: "POST",
      tenantId,
      body: { sourceAccountId }
    }).then(normalizeAccountAuthorization);
  },

  getOrganizationEntitlements(tenantId: string): Promise<OrganizationEntitlement[]> {
    return request<unknown>("/organization/entitlements", { tenantId }).then((payload) => unwrapList<unknown>(payload).map(normalizeOrganizationEntitlement));
  },

  updateOrganizationEntitlements(entitlements: OrganizationEntitlement[], tenantId: string, idempotencyKey = createClientId()): Promise<OrganizationEntitlement[]> {
    return request<unknown>("/organization/entitlements", {
      method: "PUT",
      tenantId,
      idempotencyKey,
      body: { entitlements }
    }).then((payload) => unwrapList<unknown>(payload).map(normalizeOrganizationEntitlement));
  },

  getEmployeeOrderSummary(tenantId: string): Promise<EmployeeOrderSummary[]> {
    return request<unknown>("/employees/order-summary", { tenantId }).then((payload) => unwrapList<unknown>(payload).map(normalizeEmployeeOrderSummary));
  },

  getEmployeeFollowUpSummary(tenantId: string): Promise<EmployeeFollowUpSummary[]> {
    return request<unknown>("/employees/follow-up-summary", { tenantId }).then((payload) => unwrapList<unknown>(payload).map(normalizeEmployeeFollowUpSummary));
  },

  assignOrder(orderId: string, ownerUserId: string | null, tenantId: string, idempotencyKey = createClientId()): Promise<Order> {
    return request<unknown>("/orders/" + orderId + "/assignee", {
      method: "PATCH",
      tenantId,
      idempotencyKey,
      body: { ownerUserId }
    }).then((payload) => normalizeOrder(unwrapItem(payload)));
  },

  getOrderFollowUps(orderId: string, tenantId: string): Promise<OrderFollowUp[]> {
    return request<unknown>("/orders/" + orderId + "/follow-ups", { tenantId }).then((payload) => unwrapList<unknown>(payload).map(normalizeOrderFollowUp));
  },

  createOrderFollowUp(orderId: string, input: { content: string; nextFollowUpAt?: string | null }, tenantId: string, idempotencyKey = createClientId()): Promise<OrderFollowUp> {
    return request<unknown>("/orders/" + orderId + "/follow-ups", {
      method: "POST",
      tenantId,
      idempotencyKey,
      body: input
    }).then((payload) => normalizeOrderFollowUp(unwrapItem(payload)));
  },

  listWarehouses(tenantId: string): Promise<Warehouse[]> {
    return request<unknown>("/warehouses", { tenantId }).then((payload) => unwrapList<unknown>(payload).map(normalizeWarehouse));
  },

  listInventoryMaterials(tenantId: string): Promise<InventoryMaterial[]> {
    return request<unknown>("/materials", { tenantId }).then((payload) => unwrapList<unknown>(payload).map((item, index) => normalizeInventoryMaterial(item, index)));
  },

  listInventoryBalances(tenantId: string, warehouseId?: string): Promise<InventoryBalance[]> {
    const query = warehouseId ? `?warehouseId=${encodeURIComponent(warehouseId)}` : "";
    return request<unknown>("/inventory/balances" + query, { tenantId }).then((payload) => unwrapList<unknown>(payload).map((item, index) => normalizeInventoryBalance(item, index)));
  },

  listInventoryShortages(tenantId: string): Promise<InventoryShortageAlert[]> {
    return request<unknown>("/inventory/shortages", { tenantId }).then((payload) => unwrapList<unknown>(payload).map((item, index) => normalizeInventoryShortage(item, index)));
  },

  listInventoryLedger(tenantId: string, options: { warehouseId?: string; materialKey?: string; documentType?: string } = {}): Promise<InventoryLedgerEntry[]> {
    const query = new URLSearchParams();
    if (options.warehouseId) query.set("warehouseId", options.warehouseId);
    if (options.materialKey) query.set("materialKey", options.materialKey);
    if (options.documentType) query.set("documentType", options.documentType);
    return request<unknown>("/inventory/ledger" + (query.size ? `?${query.toString()}` : ""), { tenantId }).then((payload) => unwrapList<unknown>(payload).map((item, index) => normalizeInventoryLedger(item, index)));
  },

  listStockDocuments(tenantId: string, type?: string): Promise<StockDocument[]> {
    const query = type ? `?type=${encodeURIComponent(type)}` : "";
    return request<unknown>("/stock-documents" + query, { tenantId }).then((payload) => unwrapList<unknown>(payload).map((item, index) => normalizeStockDocument(item, index)));
  },

  createStockDocument(input: { documentType: string; warehouseId: string; reference?: string; note?: string; lines: StockDocumentLineInput[] }, tenantId: string, idempotencyKey = createClientId()): Promise<StockDocument> {
    const type = input.documentType === "inbound" || input.documentType === "receive" ? "receive" : input.documentType === "outbound" || input.documentType === "issue" ? "issue" : input.documentType;
    return request<unknown>("/stock-documents", {
      method: "POST",
      tenantId,
      idempotencyKey,
      body: {
        type,
        warehouseId: input.warehouseId,
        note: [input.reference, input.note].filter(Boolean).join(" · ") || undefined,
        lines: input.lines.map((line) => ({ materialId: line.materialId, materialKey: line.materialKey, specKey: line.specKey || line.specification || "standard", color: line.color || undefined, finish: line.finish || undefined, qty: line.quantity, note: line.name }))
      }
    }).then((payload) => normalizeStockDocument(unwrapItem(payload)));
  },

  postStockDocument(documentId: string, tenantId: string, idempotencyKey = createClientId()): Promise<StockDocument> {
    return request<unknown>(`/stock-documents/${documentId}/post`, { method: "POST", tenantId, idempotencyKey, body: {} }).then((payload) => normalizeStockDocument(unwrapItem(payload)));
  },

  reverseStockDocument(documentId: string, tenantId: string, idempotencyKey = createClientId()): Promise<StockDocument> {
    return request<unknown>(`/stock-documents/${documentId}/reverse`, { method: "POST", tenantId, idempotencyKey, body: {} }).then((payload) => normalizeStockDocument(unwrapItem(payload)));
  },

  previewInventoryImport(input: { materialRows: Array<Record<string, unknown>>; openingRows: Array<Record<string, unknown>> }, tenantId: string): Promise<InventoryImportPreview> {
    return request<unknown>("/materials/import/preview", { method: "POST", tenantId, body: input }).then((payload) => {
      const raw = asRecord(unwrapItem(payload));
      const errors = Array.isArray(raw.errors) ? raw.errors.map((value, index) => {
        const error = asRecord(value);
        return { sheet: error.sheet ? String(error.sheet) : undefined, row: Number(error.row ?? index + 2), message: display(error.message, "导入行无效") };
      }) : [];
      return {
        materialRows: Array.isArray(raw.materialRows ?? raw.rows) ? (raw.materialRows ?? raw.rows) as Array<Record<string, unknown>> : [],
        openingRows: Array.isArray(raw.openingRows) ? raw.openingRows as Array<Record<string, unknown>> : [],
        created: Number(raw.created ?? 0), updated: Number(raw.updated ?? 0), skipped: Number(raw.skipped ?? 0), conflicts: Number(raw.conflicts ?? 0), errors
      };
    });
  },

  commitInventoryImport(input: { materialRows: Array<Record<string, unknown>>; openingRows: Array<Record<string, unknown>>; batchId: string; source?: string }, tenantId: string, idempotencyKey = createClientId()): Promise<{ materials: InventoryMaterial[]; openingDocument: StockDocument | null }> {
    return request<unknown>("/materials/import/commit", { method: "POST", tenantId, idempotencyKey, body: input }).then((payload) => {
      const raw = asRecord(payload);
      return { materials: Array.isArray(raw.materials) ? raw.materials.map((item, index) => normalizeInventoryMaterial(item, index)) : [], openingDocument: raw.openingDocument ? normalizeStockDocument(raw.openingDocument) : null };
    });
  },

  getOrderMaterialRequirements(orderId: string, tenantId: string): Promise<InventoryRequirement[]> {
    return request<unknown>(`/orders/${orderId}/material-requirements`, { tenantId }).then((payload) => unwrapList<unknown>(payload).map((item, index) => normalizeInventoryRequirement(item, index)));
  },

  reserveOrderMaterials(orderId: string, input: { warehouseId: string; lines: Array<{ materialId?: string; materialKey: string; specKey?: string; color?: string; finish?: string; quantity: number }> }, tenantId: string, idempotencyKey = createClientId()): Promise<InventoryRequirement[]> {
    return request<unknown>(`/orders/${orderId}/material-reservation`, { method: "POST", tenantId, idempotencyKey, body: input }).then((payload) => unwrapList<unknown>(payload).map((item, index) => normalizeInventoryRequirement(item, index)));
  },

  issueOrderMaterials(orderId: string, input: { warehouseId: string; lines: Array<{ materialId?: string; materialKey: string; specKey?: string; color?: string; finish?: string; quantity: number }> }, tenantId: string, idempotencyKey = createClientId()): Promise<InventoryRequirement[]> {
    return request<unknown>(`/orders/${orderId}/material-issue`, { method: "POST", tenantId, idempotencyKey, body: input }).then((payload) => unwrapList<unknown>(payload).map((item, index) => normalizeInventoryRequirement(item, index)));
  }
};
