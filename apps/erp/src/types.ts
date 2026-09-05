export type Role =
  | "owner"
  | "admin"
  | "sales"
  | "designer"
  | "production"
  | "finance"
  | "member"
  | "viewer"
  | "headquarters_admin"
  | "headquarters_sales"
  | "headquarters_reviewer"
  | "production_shipping"
  | "dealer_admin"
  | "dealer_designer_sales"
  | "dealer"
  | "factory_employee";

export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 12;
export type Permission =
  | "dashboard.view"
  | "project.manage"
  | "template.manage"
  | "quote.manage"
  | "quote.approve"
  | "order.manage"
  | "production.manage"
  | "dealer.manage"
  | "pricing.manage"
  | "audit.view"
  | "employee.manage"
  | "order.assign"
  | "order.follow-up"
  | "order.transition.manage"
  | "order.delivery.manage"
  | "inventory.availability.view"
  | "inventory.quantity.view"
  | "inventory.distribution.view"
  | "inventory.value.view"
  | "inventory.receive"
  | "inventory.issue"
  | "inventory.adjust"
  | "inventory.transfer"
  | "configurator.use"
  | "templates.view"
  | "customers.view" | "customers.create" | "customers.update" | "customers.delete" | "customers.export"
  | "projects.view" | "projects.create" | "projects.update" | "projects.delete" | "projects.transfer" | "projects.export"
  | "designs.view" | "designs.create" | "designs.update" | "designs.copy" | "designs.delete" | "designs.export" | "designs.bom.export"
  | "attachments.view" | "attachments.create"
  | "quotes.view" | "quotes.create" | "quotes.update" | "quotes.submit" | "quotes.approve" | "quotes.cancel" | "quotes.export" | "quotes.multiplier.view" | "quotes.multiplier.manage"
  | "orders.view" | "orders.create" | "orders.status.update" | "orders.cancel" | "orders.assign" | "orders.follow_up" | "orders.export"
  | "fulfillment.production.view" | "fulfillment.production.update" | "fulfillment.shipments.view" | "fulfillment.shipments.create" | "fulfillment.logistics.update"
  | "prices.dealer.view" | "prices.retail.view" | "prices.master.view" | "prices.cost.view" | "prices.manage"
  | "reports.personal.view" | "reports.assigned.view" | "reports.organization.view" | "reports.financial.view" | "reports.export"
  | "account.manage" | "dealer.manage" | "permission.delegate" | "audit.view" | "dealer.workspace.access" | "platform.entitlements.manage";

export type AuthorizationDataScope = "own" | "assigned" | "specified" | "organization";

export interface PermissionGrant {
  permission: string;
  scope: AuthorizationDataScope;
  assignedUserIds: string[];
}

export interface AccountAuthorization {
  accountId: string;
  userId: string;
  grants: PermissionGrant[];
  effectivePermissions: string[];
  delegablePermissions: string[];
  dataScopes: Record<string, { resource: string; scope: AuthorizationDataScope; assignedUserIds: string[] }>;
  enabledModules: string[];
  fieldPolicy: { price: string; inventory: InventoryFieldPolicy };
}

export interface OrganizationEntitlement {
  module: string;
  enabled: boolean;
  permissionAllowlist: string[] | null;
}

export interface Tenant {
  id: string;
  name: string;
  code: string;
  plan: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface Session {
  user: User;
  principalType?: "platform_admin" | "organization_member";
  tenants: Tenant[];
  activeTenantId: string;
  authorizationOrganizationId?: string;
  dataOrganizationId?: string;
  permissions?: string[];
  enabledModules?: string[];
  effectivePermissions?: string[];
  delegablePermissions?: string[];
  dataScopes?: Record<string, { resource: string; scope: "own" | "assigned" | "specified" | "organization"; assignedUserIds: string[] }>;
  fieldPolicy?: { price: string; inventory: InventoryFieldPolicy };
  mustChangePassword?: boolean;
  passwordChangeRequired?: boolean;
  mode: "live" | "demo";
}

export interface LoginLogEntry {
  id: string;
  userId: string;
  userName: string;
  accountIdentifier: string | null;
  tenantId: string | null;
  tenantName: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface CustomerProject {
  id: string;
  code: string;
  customer: string;
  contact: string;
  phone: string;
  name: string;
  site: string;
  owner: string;
  stage: "线索" | "方案中" | "已报价" | "已成交" | "暂停";
  budget: number;
  quoteAmount: number | null;
  suggestedQuoteAmount: number | null;
  quoteSource: "quote" | "manual" | "suggested_retail" | null;
  quoteId: string | null;
  quoteRevision: number | null;
  quoteStatus: string | null;
  quoteEditable: boolean;
  quoteNote: string | null;
  basePriceTotalMinor?: number | null;
  salesMultiplierBasisPoints?: number | null;
  multiplierQuoteTotalMinor?: number | null;
  updatedAt: string;
}

export interface DesignTemplate {
  id: string;
  name: string;
  code: string;
  category: "办公" | "客厅" | "玄关" | "储物";
  dimensions: string;
  modules: number;
  version: number;
  status: "草稿" | "已发布" | "已归档";
  usageCount: number;
  updatedAt: string;
  layout: number[];
}

export interface SavedDesignDraft {
  id: string;
  code: string;
  projectId: string;
  name: string;
  status: "draft" | "review" | "approved" | "archived";
  draftRevision: number;
  updatedAt: string;
}

export type QuoteStatus = "草稿" | "待审批" | "需修改" | "已批准" | "已发送" | "客户已确认" | "已接受" | "已转订单" | "已失效";

export interface Quote {
  id: string;
  quoteNo: string;
  customer: string;
  project: string;
  owner: string;
  amount: number;
  discount: number;
  status: QuoteStatus;
  validUntil: string;
  version: number;
  basePriceTotalMinor?: number | null;
  salesMultiplierBasisPoints?: number | null;
  multiplierQuoteTotalMinor?: number | null;
  updatedAt: string;
}

export type OrderStatus = "待确认" | "已确认" | "待生产" | "生产中" | "待发货" | "已发货" | "暂停" | "已取消";
export type ProductionStatus = "未排产" | "备料" | "组装" | "质检" | "已完工";
export type ShipmentStatus = "未创建" | "待提货" | "运输中" | "已签收";

export interface Order {
  id: string;
  orderNo: string;
  acceptedQuoteId?: string | null;
  customer: string;
  project: string;
  dealer: string;
  owner: string;
  ownerUserId?: string | null;
  assignedAt?: string | null;
  amount: number;
  status: OrderStatus;
  productionStatus: ProductionStatus;
  shipmentStatus: ShipmentStatus;
  dueDate: string;
  customerConfirmedAt?: string | null;
  deliveryLeadTimeDays?: number | null;
  createdAt: string;
  version: number;
}

export interface FactoryEmployee {
  id: string;
  userId: string;
  name: string;
  username?: string;
  email: string | null;
  phone?: string;
  note?: string;
  status: "active" | "suspended";
  lastLoginAt?: string;
  createdAt?: string;
}

export interface AccountSummary {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  status: "active" | "disabled";
  lastActiveAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeOrderSummary {
  employeeUserId: string;
  employeeName: string;
  orderCount: number;
  pendingConfirmation: number;
  confirmed: number;
  readyForProduction: number;
  inProduction: number;
  readyToShip: number;
  shipped: number;
  activeAmount: number | null;
  unassignedOrderCount?: number;
  updatedAt?: string;
}

export interface EmployeeFollowUpSummary {
  employeeUserId: string;
  employeeName: string;
  followUpCount: number;
  dueTodayCount: number;
  overdueCount: number;
  latestFollowUpAt?: string;
}

export interface OrderFollowUp {
  id: string;
  orderId: string;
  employeeUserId: string;
  employeeName: string;
  content: string;
  nextFollowUpAt?: string | null;
  createdAt: string;
}

export interface OrderLine {
  id: string;
  sku: string;
  description: string;
  color: string;
  qty: number;
  unitPrice: number;
  total: number;
}

export interface OrderConfigurationPanelColor {
  panel: string;
  color: string;
}

export interface OrderConfigurationInteriorAccessory {
  id: string;
  kind: string;
  kindLabel: string;
  color?: string;
}

export interface OrderConfigurationModule {
  id: string;
  row: number;
  column: number;
  depthIndex: number;
  position: string;
  kind: string;
  kindLabel: string;
  enabled: boolean;
  width: number;
  height: number;
  depth: number;
  color: string;
  panelColors: OrderConfigurationPanelColor[];
  frontAccessory?: string;
  frontAccessoryLabel?: string;
  fitting?: string;
  fittingLabel?: string;
  interiorAccessories: OrderConfigurationInteriorAccessory[];
}

export interface OrderConfigurationWorkSurface {
  id: string;
  kind: string;
  kindLabel: string;
  enabled: boolean;
  row: number;
  fromColumn: number;
  toColumn: number;
  width: number;
  depth: number;
  thickness: number;
  color?: string;
}

export interface OrderConfigurationColor {
  value: string;
  name: string;
  code: string;
  categories: string[];
  references: number;
  positions: string[];
  bomQuantity?: number;
}

export interface OrderConfiguration {
  previewDataUrl: string | null;
  dimensions: string;
  frameColor: string;
  panelColor: string;
  modules: number;
  snapshotVersion: string;
  available: boolean;
  unavailableReason?: string;
  rows: number;
  columns: number;
  depthSegments: number[];
  columnWidths: number[];
  rowHeights: number[];
  frameFinish: string;
  feet: string;
  structureMode: string;
  moduleItems: OrderConfigurationModule[];
  workSurfaces: OrderConfigurationWorkSurface[];
  colors: OrderConfigurationColor[];
}

export interface ProductionStep {
  id: string;
  name: string;
  owner: string;
  status: "待处理" | "进行中" | "已完成" | "阻塞";
  plannedAt: string;
  completedAt?: string;
}

export interface Shipment {
  id: string;
  shipmentNo: string;
  carrier: string;
  trackingNo: string;
  status: ShipmentStatus;
  packages: number;
  shippedAt?: string;
  signedAt?: string;
}

export interface CreateShipmentInput {
  orderId: string;
  carrier: string;
  trackingNo: string;
  packages: number;
  shippedAt?: string;
}

export interface OrderDetail extends Order {
  quoteNo: string;
  poNumber: string;
  address: string;
  contact: string;
  phone: string;
  note: string;
  quoteNote: string;
  configuration: OrderConfiguration;
  lines: OrderLine[];
  production: ProductionStep[];
  shipments: Shipment[];
}

export interface Dealer {
  id: string;
  code: string;
  name: string;
  region: string;
  contact: string;
  phone: string | null;
  email: string | null;
  level: "核心" | "标准" | "观察";
  discountRate: number;
  status: "启用" | "暂停";
  lastActiveAt: string;
}

export interface PriceList {
  id: string;
  name: string;
  code: string;
  market: string;
  currency: "CNY" | "USD" | "EUR";
  version: string;
  itemCount: number;
  effectiveFrom: string;
  status: "草稿" | "生效中" | "已过期" | "已归档";
  updatedAt: string;
}

export type PriceItemCategory = "框架管件" | "板件" | "门类" | "内部配件" | "玻璃" | "五金与支撑";
export type PriceItemPricingMethod = "fixed" | "area" | "length" | "formula" | "included" | "composite";

export interface PriceListItem {
  id: string;
  priceListId: string;
  materialKey: string;
  specKey: string;
  category: PriceItemCategory;
  materialCode: string;
  name: string;
  specification: string;
  unit: string;
  pricingMethod: PriceItemPricingMethod;
  retailPriceMinor: number | null;
  previousRetailPriceMinor: number | null;
  rule: Record<string, unknown> | null;
  remark: string;
  source: "bom" | "manual";
  usesFallbackPrice: boolean;
  updatedAt: string;
}

export interface PriceListDetail extends PriceList {
  effectiveTo?: string | null;
  publishedBy?: string | null;
  publishedAt?: string | null;
  items: PriceListItem[];
}

export interface PriceListValidationIssue {
  code: string;
  message: string;
  itemId?: string;
  materialKey?: string;
  severity: "error" | "warning";
}

export interface PriceListValidationResult {
  valid: boolean;
  issues: PriceListValidationIssue[];
  checkedAt: string;
}

export interface AuditEvent {
  id: string;
  actor: string;
  role: string;
  action: string;
  resource: string;
  resourceId: string;
  tenant: string;
  createdAt: string;
  ip: string;
  detail: string;
}

export interface QuoteAdjustmentAudit {
  id: string;
  action: string;
  actor: string;
  createdAt: string;
  suggestedAmount: number | null;
  previousAmount: number | null;
  finalAmount: number | null;
  reason: string;
  note: string | null;
  basePriceAmount?: number | null;
  salesMultiplierBasisPoints?: number | null;
  multiplierQuoteAmount?: number | null;
  priceListId?: string | null;
  priceListVersion?: string | null;
}

export type InventoryFieldPolicy = "none" | "availability" | "quantity" | "distribution" | "value";

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  address?: string | null;
  status?: "active" | "inactive";
}

export interface InventoryMaterial {
  id: string;
  materialKey: string;
  specKey: string;
  materialCode: string;
  name: string;
  specification: string;
  unit: string;
  category?: string;
  color?: string | null;
  finish?: string | null;
  weightKg?: number | null;
  referenceCostMinor?: number | null;
  note?: string;
  source?: string;
  active?: boolean;
}

export interface InventoryBalance {
  id: string;
  warehouseId: string;
  warehouseName?: string;
  materialId?: string;
  materialKey: string;
  specKey?: string;
  color?: string | null;
  finish?: string | null;
  materialCode: string;
  name: string;
  specification: string;
  unit: string;
  onHandQty?: number | null;
  availableQty?: number | null;
  /** Boolean supply status returned when quantities are hidden. */
  isAvailable?: boolean | null;
  reservedQty?: number | null;
  inboundQty?: number | null;
  outboundQty?: number | null;
  valueMinor?: number | null;
  updatedAt: string;
}

export interface InventoryShortageAlert {
  id: string;
  kind: "custom_made" | "stock_shortage" | "depleted_stock";
  reason: string;
  followUp: "production" | "replenishment";
  orderId: string | null;
  orderCode: string | null;
  orderStatus: string | null;
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

export interface InventoryLedgerEntry {
  id: string;
  documentNo: string;
  documentType: "inbound" | "outbound" | "adjustment" | "transfer" | string;
  status?: "draft" | "posted" | "reversed" | string;
  warehouseId: string;
  warehouseName?: string;
  materialId?: string;
  materialKey: string;
  specKey?: string;
  color?: string | null;
  finish?: string | null;
  materialCode: string;
  name: string;
  specification: string;
  unit: string;
  quantity: number;
  direction: "in" | "out";
  reference?: string | null;
  operatorName?: string | null;
  occurredAt: string;
  note?: string | null;
}

export interface StockDocumentLineInput {
  materialId?: string;
  materialKey: string;
  specKey?: string;
  color?: string | null;
  finish?: string | null;
  materialCode?: string;
  name?: string;
  specification?: string;
  unit?: string;
  quantity: number;
}

export interface InventoryImportError {
  sheet?: string;
  row: number;
  message: string;
}

export interface InventoryImportPreview {
  materialRows: Array<Record<string, unknown>>;
  openingRows: Array<Record<string, unknown>>;
  created: number;
  updated: number;
  skipped: number;
  conflicts: number;
  errors: InventoryImportError[];
}

export interface StockDocument {
  id: string;
  documentNo: string;
  documentType: "inbound" | "outbound" | "adjustment" | "transfer" | string;
  status: "draft" | "posted" | "reversed" | string;
  warehouseId: string;
  warehouseName?: string;
  reference?: string | null;
  note?: string | null;
  lines: StockDocumentLineInput[];
  createdAt: string;
  postedAt?: string | null;
}

export interface InventoryRequirement {
  id: string;
  orderId?: string;
  materialId?: string;
  materialKey: string;
  specKey?: string;
  color?: string | null;
  finish?: string | null;
  materialCode: string;
  name: string;
  specification: string;
  unit: string;
  requiredQty: number;
  reservedQty: number;
  issuedQty: number;
  availableQty?: number | null;
  status: "unreserved" | "reserved" | "partial" | "issued" | "shortage" | string;
}

export interface WorkspaceData {
  projects: CustomerProject[];
  templates: DesignTemplate[];
  quotes: Quote[];
  orders: Order[];
  dealers: Dealer[];
  priceLists: PriceList[];
  audits: AuditEvent[];
}
