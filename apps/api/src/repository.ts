import type {
  AccountStatus,
  AccountSummary,
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
  UpdateOrderDeliveryScheduleInput,
  OrderAssignment,
  OrderFollowUp,
  OrderStatus,
  PriceList,
  PriceListItem,
  PriceListValidation,
  SavePriceListItemInput,
  ClonePriceListInput,
  Project,
  Quote,
  QuoteStatus,
  SalesPricingPreference,
  Role,
  AccountAuthorization,
  AuthorizationSnapshot,
  ErpModule,
  Permission,
  UpdateAccountAuthorizationInput,
  UpdateOrganizationEntitlementsInput,
  OrganizationEntitlement,
  Shipment,
  Template,
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

export interface AuthMembership {
  tenant: { id: string; name: string; slug: string };
  role: Role;
  organizationType?: "hq" | "dealer";
  delegatedFromTenantId?: string;
}

export interface AuditInput {
  tenantId: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  requestId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

export interface LoginLogInput {
  userId: string;
  tenantId: string | null;
  accountIdentifier?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface LoginLogQuery {
  search?: string;
  tenantId?: string;
  start?: string;
  end?: string;
  page: number;
  pageSize: number;
}

export interface LoginLogSummary {
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

export interface IdempotencyRecord {
  tenantId: string;
  key: string;
  route: string;
  requestHash: string;
  statusCode: number;
  response: unknown;
}

export interface Repository {
  readonly mode: "memory" | "postgres";
  resolveMembership(userId: string, preferredTenantId?: string): Promise<AuthMembership | null>;
  listAvailableTenants(userId: string, includeAllOrganizations?: boolean): Promise<Array<{ id: string; name: string; slug: string }>>;
  getUserSecurityState(userId: string): Promise<{ globalRole: string; mustChangePassword: boolean }>;
  setPasswordChangeRequired(userId: string, required: boolean): Promise<void>;
  getAuthorization(userId: string, tenantId: string, role?: Role): Promise<AuthorizationSnapshot>;
  getAccountAuthorization(tenantId: string, accountId: string): Promise<AccountAuthorization | null>;
  previewAccountAuthorization(tenantId: string, accountId: string, input: UpdateAccountAuthorizationInput): Promise<AccountAuthorization | null>;
  updateAccountAuthorization(tenantId: string, accountId: string, input: UpdateAccountAuthorizationInput, actorUserId: string): Promise<AccountAuthorization>;
  listOrganizationEntitlements(tenantId: string): Promise<OrganizationEntitlement[]>;
  updateOrganizationEntitlements(tenantId: string, input: UpdateOrganizationEntitlementsInput, actorUserId: string): Promise<OrganizationEntitlement[]>;

  listTemplates(tenantId: string): Promise<Template[]>;
  getTemplate(tenantId: string, id: string): Promise<Template | null>;

  listWarehouses(tenantId: string): Promise<Warehouse[]>;
  createWarehouse(tenantId: string, input: CreateWarehouseInput): Promise<Warehouse>;
  listMaterials(tenantId: string, search?: string): Promise<MaterialVariant[]>;
  getMaterialByKey(tenantId: string, key: Pick<MaterialVariant, "materialKey" | "specKey" | "color" | "finish">): Promise<MaterialVariant | null>;
  createMaterial(tenantId: string, input: CreateMaterialVariantInput): Promise<MaterialVariant>;
  listInventoryBalances(tenantId: string, warehouseId?: string, materialIds?: string[]): Promise<InventoryBalance[]>;
  listInventoryLedger(tenantId: string, warehouseId?: string, materialId?: string): Promise<InventoryLedger[]>;
  listStockDocuments(tenantId: string, type?: StockDocument["type"]): Promise<StockDocument[]>;
  listInventoryReservations(tenantId: string, orderId?: string): Promise<InventoryReservation[]>;
  createStockDocument(tenantId: string, input: CreateStockDocumentInput, actorUserId: string): Promise<StockDocument>;
  postStockDocument(tenantId: string, id: string, actorUserId: string): Promise<StockDocument>;
  reverseStockDocument(tenantId: string, id: string, actorUserId: string): Promise<StockDocument>;
  createInventoryReservation(tenantId: string, input: CreateInventoryReservationInput, actorUserId: string): Promise<InventoryReservation[]>;
  releaseInventoryReservation(tenantId: string, orderId: string, actorUserId: string): Promise<InventoryReservation[]>;
  issueInventoryReservation(tenantId: string, input: CreateInventoryReservationInput, actorUserId: string): Promise<{ document: StockDocument; reservations: InventoryReservation[] }>;
  previewMaterialImport(tenantId: string, input: MaterialImportPreviewInput): Promise<{ materialRows: NonNullable<MaterialImportCommitInput["materialRows"]>; openingRows: NonNullable<MaterialImportCommitInput["openingRows"]>; created: number; updated: number; skipped: number; conflicts: number; errors: Array<{ sheet?: string; row: number; message: string }> }>;
  commitMaterialImport(tenantId: string, input: MaterialImportCommitInput, actorUserId: string): Promise<{ materials: MaterialVariant[]; openingDocument: StockDocument | null }>;

  listDealers(tenantId: string): Promise<Dealer[]>;
  createDealer(tenantId: string, input: CreateDealerInput): Promise<Dealer>;
  ensureDealerAdmin(organizationId: string, userId: string, input: { name: string; phone: string; email?: string }): Promise<void>;
  getDealerForOrganization(organizationId: string): Promise<Dealer | null>;
  updateDealerSettlementRate(tenantId: string, id: string, settlementRatePercent: number): Promise<Dealer>;
  getPricingTenantId(organizationId: string): Promise<string>;
  getSalesPricingPreference(organizationId: string, userId: string): Promise<SalesPricingPreference | null>;
  setSalesPricingPreference(organizationId: string, userId: string, salesMultiplierBasisPoints: number): Promise<SalesPricingPreference>;

  listAccounts(tenantId: string): Promise<AccountSummary[]>;
  createOrganizationAdmin(tenantId: string, userId: string, input: CreateOrganizationAdminInput): Promise<AccountSummary>;
  updateAccountStatus(tenantId: string, id: string, status: AccountStatus): Promise<AccountSummary>;
  listEmployees(tenantId: string): Promise<Employee[]>;
  createEmployee(tenantId: string, userId: string, input: CreateEmployeeInput): Promise<Employee>;
  updateEmployeeStatus(tenantId: string, id: string, status: AccountStatus): Promise<Employee>;
  listEmployeeOrderSummaries(tenantId: string, employeeUserId?: string): Promise<EmployeeOrderSummary[]>;
  listEmployeeFollowUpSummaries(tenantId: string, employeeUserId?: string): Promise<EmployeeFollowUpSummary[]>;

  listPriceLists(tenantId: string): Promise<PriceList[]>;
  createPriceList(tenantId: string, input: CreatePriceListInput): Promise<PriceList>;
  getPriceList(tenantId: string, id: string): Promise<PriceList | null>;
  listPriceListItems(tenantId: string, priceListId: string): Promise<PriceListItem[]>;
  savePriceListItems(tenantId: string, priceListId: string, items: SavePriceListItemInput[]): Promise<PriceListItem[]>;
  validatePriceList(tenantId: string, priceListId: string): Promise<PriceListValidation>;
  publishPriceList(tenantId: string, priceListId: string, userId: string, effectiveFrom?: string): Promise<PriceList>;
  clonePriceList(tenantId: string, priceListId: string, input: ClonePriceListInput): Promise<PriceList>;
  getActivePriceList(tenantId: string, market: string, currency: string, at?: Date): Promise<PriceList | null>;
  getPublicPricingTenantId(market: string, currency: string, at?: Date): Promise<string | null>;

  listCustomers(tenantId: string): Promise<Customer[]>;
  getCustomer(tenantId: string, id: string): Promise<Customer | null>;
  createCustomer(tenantId: string, userId: string, input: CreateCustomerInput): Promise<Customer>;
  updateCustomer(tenantId: string, id: string, revision: number, input: Partial<Customer>): Promise<Customer>;

  listProjects(tenantId: string, customerId?: string): Promise<Project[]>;
  getProject(tenantId: string, id: string): Promise<Project | null>;
  createProject(tenantId: string, userId: string, input: CreateProjectInput): Promise<Project>;
  updateProject(tenantId: string, id: string, revision: number, input: Partial<Project>): Promise<Project>;

  listDesigns(tenantId: string, projectId?: string): Promise<Design[]>;
  getDesign(tenantId: string, id: string): Promise<Design | null>;
  createDesign(tenantId: string, userId: string, input: CreateDesignInput): Promise<Design>;
  updateDesignDraft(
    tenantId: string,
    id: string,
    draftRevision: number,
    input: Pick<Design, "configSnapshot" | "bomSnapshot" | "pricingSnapshot"> & { name?: string }
  ): Promise<Design>;
  createDesignVersion(
    tenantId: string,
    designId: string,
    userId: string,
    note?: string
  ): Promise<DesignVersion>;
  getDesignVersion(tenantId: string, id: string): Promise<DesignVersion | null>;

  listQuotes(tenantId: string, projectId?: string): Promise<Quote[]>;
  getQuote(tenantId: string, id: string): Promise<Quote | null>;
  createQuote(
    tenantId: string,
    input: Omit<Quote, "id" | "tenantId" | "code" | "revision" | "createdAt" | "updatedAt">
  ): Promise<Quote>;
  updateQuote(tenantId: string, id: string, revision: number, input: Partial<Quote>): Promise<Quote>;
  transitionQuote(tenantId: string, id: string, revision: number, status: QuoteStatus): Promise<Quote>;

  listOrders(tenantId: string, projectId?: string, ownerUserId?: string): Promise<Order[]>;
  getOrder(tenantId: string, id: string, ownerUserId?: string): Promise<Order | null>;
  createOrder(
    tenantId: string,
    input: Omit<Order, "id" | "tenantId" | "code" | "revision" | "createdAt" | "updatedAt">
  ): Promise<Order>;
  createOrderFromQuote(
    tenantId: string,
    quoteRevision: number,
    input: Omit<Order, "id" | "tenantId" | "code" | "revision" | "createdAt" | "updatedAt">
  ): Promise<{ order: Order; quote: Quote }>;
  transitionOrder(
    tenantId: string,
    id: string,
    revision: number,
    status: OrderStatus,
    shippingNote?: string,
    actorUserId?: string
  ): Promise<Order>;
  updateOrderDeliverySchedule(
    tenantId: string,
    id: string,
    revision: number,
    input: UpdateOrderDeliveryScheduleInput & { customerConfirmedAt: string; expectedDeliveryDate: string }
  ): Promise<Order>;
  assignOrder(tenantId: string, id: string, input: AssignOrderInput, assignedByUserId: string): Promise<{ order: Order; assignment: OrderAssignment }>;
  listOrderFollowUps(tenantId: string, orderId: string): Promise<OrderFollowUp[]>;
  createOrderFollowUp(tenantId: string, orderId: string, authorUserId: string, input: CreateOrderFollowUpInput): Promise<OrderFollowUp>;

  listShipments(tenantId: string, orderId?: string): Promise<Shipment[]>;
  createShipment(tenantId: string, input: CreateShipmentInput): Promise<{ shipment: Shipment; order: Order }>;

  listAttachments(tenantId: string, entityType?: string, entityId?: string): Promise<Attachment[]>;
  createAttachment(tenantId: string, userId: string, input: CreateAttachmentInput): Promise<Attachment>;

  recordAudit(input: AuditInput): Promise<AuditLog>;
  listAudit(tenantId: string, entityType?: string, entityId?: string): Promise<AuditLog[]>;
  recordLoginLog(input: LoginLogInput): Promise<void>;
  listLoginLogs(query: LoginLogQuery): Promise<{ items: LoginLogSummary[]; total: number }>;
  getIdempotency(tenantId: string, route: string, key: string): Promise<IdempotencyRecord | null>;
  saveIdempotency(record: IdempotencyRecord): Promise<void>;
  close(): Promise<void>;
}
