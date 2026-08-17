import { z } from "zod";

export const IdSchema = z.string().min(1).max(128);
export const IsoDateTimeSchema = z.iso.datetime({ offset: true });
export const JsonObjectSchema = z.record(z.string(), z.unknown());
export const RevisionSchema = z.number().int().positive();
export const CurrencySchema = z.string().length(3).transform((value) => value.toUpperCase());
export const MoneyMinorSchema = z.number().int().nonnegative();

export const RoleSchema = z.enum([
  "owner",
  "admin",
  "sales",
  "designer",
  "production",
  "finance",
  "member",
  "viewer",
  "headquarters_admin",
  "headquarters_sales",
  "headquarters_reviewer",
  "production_shipping",
  "dealer_admin",
  "dealer_designer_sales",
  "factory_employee"
]);
export type Role = z.infer<typeof RoleSchema>;

export const ErpModuleSchema = z.enum([
  "configurator", "crm", "quotes", "orders", "fulfillment", "pricing",
  "warehouse", "reports", "accounts", "dealers", "audit"
]);
export type ErpModule = z.infer<typeof ErpModuleSchema>;

export const PermissionSchema = z.enum([
  "configurator.use",
  "templates.view",
  "customers.view", "customers.create", "customers.update", "customers.delete", "customers.export",
  "projects.view", "projects.create", "projects.update", "projects.delete", "projects.transfer", "projects.export",
  "designs.view", "designs.create", "designs.update", "designs.copy", "designs.delete", "designs.export", "designs.bom.export",
  "attachments.view", "attachments.create",
  "quotes.view", "quotes.create", "quotes.update", "quotes.submit", "quotes.approve", "quotes.cancel", "quotes.export", "quotes.multiplier.view", "quotes.multiplier.manage",
  "orders.view", "orders.create", "orders.status.update", "orders.cancel", "orders.assign", "orders.follow_up", "orders.export",
  "fulfillment.production.view", "fulfillment.production.update", "fulfillment.shipments.view", "fulfillment.shipments.create", "fulfillment.logistics.update",
  "prices.dealer.view", "prices.retail.view", "prices.master.view", "prices.cost.view", "prices.manage",
  "inventory.availability.view", "inventory.quantity.view", "inventory.distribution.view", "inventory.value.view", "inventory.receive", "inventory.issue", "inventory.adjust", "inventory.transfer",
  "reports.personal.view", "reports.assigned.view", "reports.organization.view", "reports.financial.view", "reports.export",
  "account.manage", "dealer.manage", "permission.delegate", "audit.view", "dealer.workspace.access", "platform.entitlements.manage"
]);
export type Permission = z.infer<typeof PermissionSchema>;

export const DataScopeSchema = z.enum(["own", "assigned", "specified", "organization"]);
export type DataScope = z.infer<typeof DataScopeSchema>;

export const FieldPolicySchema = z.object({
  price: z.enum(["none", "dealer_only", "retail", "master", "cost"]),
  inventory: z.enum(["none", "availability", "quantity", "distribution", "value"])
});
export type FieldPolicy = z.infer<typeof FieldPolicySchema>;

export const PermissionGrantSchema = z.object({
  permission: PermissionSchema,
  scope: DataScopeSchema.default("organization"),
  assignedUserIds: z.array(IdSchema).default([])
});
export type PermissionGrant = z.infer<typeof PermissionGrantSchema>;

export const ResourceDataScopeSchema = z.object({
  resource: z.string().trim().min(1).max(100),
  scope: DataScopeSchema,
  assignedUserIds: z.array(IdSchema).default([])
});
export type ResourceDataScope = z.infer<typeof ResourceDataScopeSchema>;

export const AuthorizationSnapshotSchema = z.object({
  enabledModules: z.array(ErpModuleSchema),
  effectivePermissions: z.array(PermissionSchema),
  delegablePermissions: z.array(PermissionSchema),
  dataScopes: z.record(z.string(), ResourceDataScopeSchema),
  fieldPolicy: FieldPolicySchema
});
export type AuthorizationSnapshot = z.infer<typeof AuthorizationSnapshotSchema>;

export const AccountAuthorizationSchema = AuthorizationSnapshotSchema.extend({
  accountId: IdSchema,
  userId: IdSchema,
  grants: z.array(PermissionGrantSchema)
});
export type AccountAuthorization = z.infer<typeof AccountAuthorizationSchema>;

export const UpdateAccountAuthorizationSchema = z.object({
  grants: z.array(PermissionGrantSchema).max(200),
  dataScopes: z.array(ResourceDataScopeSchema).max(100).default([])
});
export type UpdateAccountAuthorizationInput = z.infer<typeof UpdateAccountAuthorizationSchema>;

export const CopyAccountAuthorizationSchema = z.object({
  sourceAccountId: IdSchema
});
export type CopyAccountAuthorizationInput = z.infer<typeof CopyAccountAuthorizationSchema>;

export const OrganizationEntitlementSchema = z.object({
  module: ErpModuleSchema,
  enabled: z.boolean(),
  permissionAllowlist: z.array(PermissionSchema).nullable().default(null)
});
export type OrganizationEntitlement = z.infer<typeof OrganizationEntitlementSchema>;

export const UpdateOrganizationEntitlementsSchema = z.object({
  entitlements: z.array(OrganizationEntitlementSchema).min(1).max(50)
});
export type UpdateOrganizationEntitlementsInput = z.infer<typeof UpdateOrganizationEntitlementsSchema>;

export const ErrorCodeSchema = z.enum([
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "PRECONDITION_REQUIRED",
  "VERSION_CONFLICT",
  "IDEMPOTENCY_CONFLICT",
  "INVALID_TRANSITION",
  "PASSWORD_CHANGE_REQUIRED",
  "PASSWORD_POLICY",
  "INTERNAL_ERROR"
]);

export const ApiErrorSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional()
  })
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const SessionSchema = z.object({
  authenticated: z.boolean(),
  user: z.object({
    id: IdSchema,
    name: z.string(),
    email: z.email()
  }).nullable(),
  tenant: z.object({
    id: IdSchema,
    name: z.string(),
    slug: z.string()
  }).nullable(),
  membership: z.object({ role: RoleSchema }).nullable(),
  authorizationOrganizationId: IdSchema.optional(),
  dataOrganizationId: IdSchema.optional(),
  enabledModules: z.array(ErpModuleSchema).default([]),
  effectivePermissions: z.array(PermissionSchema).default([]),
  delegablePermissions: z.array(PermissionSchema).default([]),
  dataScopes: z.record(z.string(), ResourceDataScopeSchema).default({}),
  fieldPolicy: FieldPolicySchema.default({ price: "none", inventory: "none" }),
  principalType: z.enum(["platform_admin", "organization_member"]).optional(),
  mustChangePassword: z.boolean().default(false),
  passwordChangeRequired: z.boolean().default(false)
});
export type Session = z.infer<typeof SessionSchema>;

const EntityBaseSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  revision: RevisionSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema
});

export const CustomerStatusSchema = z.enum(["active", "inactive"]);
export const CustomerSchema = EntityBaseSchema.extend({
  code: z.string(),
  createdByUserId: IdSchema.nullable(),
  name: z.string(),
  companyName: z.string().nullable(),
  email: z.email().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  status: CustomerStatusSchema
});
export const CreateCustomerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  companyName: z.string().trim().max(200).optional(),
  email: z.email().optional(),
  phone: z.string().trim().max(50).optional(),
  address: z.string().trim().max(500).optional()
});
export const UpdateCustomerSchema = CreateCustomerSchema.partial().extend({
  status: CustomerStatusSchema.optional()
});
export type Customer = z.infer<typeof CustomerSchema>;
export type CreateCustomerInput = z.infer<typeof CreateCustomerSchema>;

export const ProjectStatusSchema = z.enum([
  "lead",
  "designing",
  "quoted",
  "won",
  "lost",
  "on_hold",
  "closed"
]);
export const ProjectSchema = EntityBaseSchema.extend({
  code: z.string(),
  createdByUserId: IdSchema.nullable(),
  customerId: IdSchema.nullable(),
  name: z.string(),
  status: ProjectStatusSchema,
  ownerUserId: IdSchema.nullable(),
  description: z.string().nullable(),
  targetDate: z.string().nullable()
});
export const CreateProjectSchema = z.object({
  customerId: IdSchema.optional(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  targetDate: z.string().date().optional()
});
export const UpdateProjectSchema = CreateProjectSchema.partial().extend({
  status: ProjectStatusSchema.optional(),
  ownerUserId: IdSchema.nullable().optional()
});
export type Project = z.infer<typeof ProjectSchema>;
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

export const TemplateStatusSchema = z.enum(["draft", "published", "archived"]);
export const TemplateVersionSchema = z.object({
  id: IdSchema,
  templateId: IdSchema,
  version: z.number().int().positive(),
  name: z.string(),
  configSnapshot: JsonObjectSchema,
  bomSnapshot: z.array(JsonObjectSchema),
  pricingSnapshot: JsonObjectSchema,
  publishedAt: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema
});
export const TemplateSchema = EntityBaseSchema.extend({
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: TemplateStatusSchema,
  latestVersion: TemplateVersionSchema.nullable()
});
export type Template = z.infer<typeof TemplateSchema>;
export type TemplateVersion = z.infer<typeof TemplateVersionSchema>;

export const DesignStatusSchema = z.enum(["draft", "review", "approved", "archived"]);
export const DesignSchema = EntityBaseSchema.extend({
  code: z.string(),
  createdByUserId: IdSchema.nullable(),
  projectId: IdSchema,
  name: z.string(),
  templateVersionId: IdSchema.nullable(),
  status: DesignStatusSchema,
  draftRevision: RevisionSchema,
  configSnapshot: JsonObjectSchema,
  bomSnapshot: z.array(JsonObjectSchema),
  pricingSnapshot: JsonObjectSchema
});
export const CreateDesignSchema = z.object({
  projectId: IdSchema,
  name: z.string().trim().min(1).max(200),
  templateVersionId: IdSchema.optional(),
  configSnapshot: JsonObjectSchema,
  bomSnapshot: z.array(JsonObjectSchema).default([]),
  pricingSnapshot: JsonObjectSchema.default({})
});
export const UpdateDesignDraftSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  configSnapshot: JsonObjectSchema,
  bomSnapshot: z.array(JsonObjectSchema),
  pricingSnapshot: JsonObjectSchema.default({})
});
export const DesignVersionSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  designId: IdSchema,
  version: z.number().int().positive(),
  sourceDraftRevision: RevisionSchema,
  configSnapshot: JsonObjectSchema,
  bomSnapshot: z.array(JsonObjectSchema),
  pricingSnapshot: JsonObjectSchema,
  note: z.string().nullable(),
  createdBy: IdSchema,
  createdAt: IsoDateTimeSchema
});
export const CreateDesignVersionSchema = z.object({
  note: z.string().trim().max(1000).optional()
});
export type Design = z.infer<typeof DesignSchema>;
export type CreateDesignInput = z.input<typeof CreateDesignSchema>;

export const QuoteStatusSchema = z.enum([
  "draft",
  "priced",
  "submitted",
  "changes_requested",
  "approved",
  "customer_confirmed",
  "converted",
  "sent",
  "accepted",
  "rejected",
  "expired",
  "cancelled"
]);
export const QuoteLineSchema = z.object({
  id: IdSchema,
  sourceRef: z.string(),
  description: z.string(),
  quantity: z.number().positive(),
  unitPriceMinor: MoneyMinorSchema,
  lineTotalMinor: MoneyMinorSchema,
  pricingStatus: z.enum(["priced", "included", "unmatched"]),
  metadata: JsonObjectSchema
});
export const SalesMultiplierBasisPointsSchema = z.number().int().min(10_000).max(99_900);
export const SalesPricingPreferenceSchema = z.object({
  salesMultiplierBasisPoints: SalesMultiplierBasisPointsSchema,
  source: z.enum(["user_default", "system_default"]),
  updatedAt: IsoDateTimeSchema.nullable()
});
export const UpdateSalesPricingPreferenceSchema = z.object({
  salesMultiplierBasisPoints: SalesMultiplierBasisPointsSchema
});
export const QuoteSchema = EntityBaseSchema.extend({
  code: z.string(),
  createdByUserId: IdSchema.nullable(),
  projectId: IdSchema,
  customerId: IdSchema.nullable(),
  designVersionId: IdSchema,
  status: QuoteStatusSchema,
  currency: CurrencySchema,
  subtotalMinor: MoneyMinorSchema,
  discountMinor: MoneyMinorSchema,
  taxMinor: MoneyMinorSchema,
  totalMinor: MoneyMinorSchema,
  basePriceTotalMinor: MoneyMinorSchema.nullable(),
  salesMultiplierBasisPoints: SalesMultiplierBasisPointsSchema.nullable(),
  multiplierQuoteTotalMinor: MoneyMinorSchema.nullable(),
  validUntil: z.string().nullable(),
  notes: z.string().nullable(),
  lines: z.array(QuoteLineSchema),
  snapshot: JsonObjectSchema
});
const PreviewDataUrlSchema = z.string()
  .max(900_000)
  .regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/i)
  .refine((value) => value.slice(value.indexOf(",") + 1).length % 4 === 0, "Invalid base64 image data");
export const CreateQuoteSchema = z.object({
  projectId: IdSchema,
  customerId: IdSchema.optional(),
  designVersionId: IdSchema,
  currency: CurrencySchema.default("CNY"),
  discountMinor: MoneyMinorSchema.default(0),
  taxRateBasisPoints: z.number().int().min(0).max(10000).default(0),
  validUntil: z.string().date().optional(),
  notes: z.string().trim().max(4000).optional(),
  previewDataUrl: PreviewDataUrlSchema.optional(),
  salesMultiplierBasisPoints: SalesMultiplierBasisPointsSchema.optional(),
  manualTotalMinor: MoneyMinorSchema.optional(),
  adjustmentReason: z.string().trim().min(1).max(500).optional()
});
export const UpdateQuoteSchema = z.object({
  discountMinor: MoneyMinorSchema.optional(),
  taxRateBasisPoints: z.number().int().min(0).max(10000).optional(),
  validUntil: z.string().date().nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  salesMultiplierBasisPoints: SalesMultiplierBasisPointsSchema.optional(),
  manualTotalMinor: MoneyMinorSchema.optional(),
  adjustmentReason: z.string().trim().min(1).max(500).optional()
});
export const CreateProjectQuoteSchema = z.object({
  manualTotalMinor: MoneyMinorSchema.optional(),
  salesMultiplierBasisPoints: SalesMultiplierBasisPointsSchema.optional(),
  adjustmentReason: z.string().trim().min(1).max(500).optional(),
  notes: z.string().trim().max(4000).nullable().optional()
});
export const QuoteTransitionSchema = z.object({
  to: QuoteStatusSchema,
  note: z.string().trim().max(1000).optional()
});
export type Quote = z.infer<typeof QuoteSchema>;
export type QuoteLine = z.infer<typeof QuoteLineSchema>;
export type QuoteStatus = z.infer<typeof QuoteStatusSchema>;
export type SalesPricingPreference = z.infer<typeof SalesPricingPreferenceSchema>;
export type UpdateSalesPricingPreferenceInput = z.input<typeof UpdateSalesPricingPreferenceSchema>;

export const OrderStatusSchema = z.enum([
  "draft",
  "confirmed",
  "technical_review",
  "ready_for_production",
  "in_production",
  "ready_to_ship",
  "shipped",
  "delivered",
  "completed",
  "on_hold",
  "cancelled"
]);
export const OrderSchema = EntityBaseSchema.extend({
  code: z.string(),
  createdByUserId: IdSchema.nullable(),
  projectId: IdSchema,
  customerId: IdSchema.nullable(),
  acceptedQuoteId: IdSchema,
  status: OrderStatusSchema,
  currency: CurrencySchema,
  totalMinor: MoneyMinorSchema,
  snapshot: JsonObjectSchema,
  customerConfirmedAt: IsoDateTimeSchema.nullable(),
  deliveryLeadTimeDays: z.number().int().min(1).max(365).nullable(),
  expectedDeliveryDate: z.string().date().nullable(),
  productionNote: z.string().nullable(),
  shippingNote: z.string().nullable(),
  ownerUserId: IdSchema.nullable(),
  assignedAt: IsoDateTimeSchema.nullable(),
  assignedByUserId: IdSchema.nullable()
});
export const CreateOrderSchema = z.object({
  acceptedQuoteId: IdSchema,
  productionNote: z.string().trim().max(4000).optional(),
  previewDataUrl: PreviewDataUrlSchema.optional(),
  deliveryLeadTimeDays: z.number().int().min(1).max(365).default(30)
});
export const UpdateOrderDeliveryScheduleSchema = z.object({
  deliveryLeadTimeDays: z.number().int().min(1).max(365)
});
export const OrderTransitionSchema = z.object({
  to: OrderStatusSchema,
  note: z.string().trim().max(1000).optional(),
  shippingNote: z.string().trim().max(4000).optional()
});
export const AssignOrderSchema = z.object({
  ownerUserId: IdSchema.nullable()
});
export const OrderAssignmentSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  orderId: IdSchema,
  previousOwnerUserId: IdSchema.nullable(),
  ownerUserId: IdSchema.nullable(),
  assignedByUserId: IdSchema,
  createdAt: IsoDateTimeSchema
});
export const OrderFollowUpSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  orderId: IdSchema,
  authorUserId: IdSchema,
  content: z.string(),
  nextFollowUpAt: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema
});
export const CreateOrderFollowUpSchema = z.object({
  content: z.string().trim().min(1).max(4000),
  nextFollowUpAt: IsoDateTimeSchema.nullable().optional()
});
export type Order = z.infer<typeof OrderSchema>;
export type OrderStatus = z.infer<typeof OrderStatusSchema>;
export type OrderAssignment = z.infer<typeof OrderAssignmentSchema>;
export type OrderFollowUp = z.infer<typeof OrderFollowUpSchema>;
export type AssignOrderInput = z.infer<typeof AssignOrderSchema>;
export type UpdateOrderDeliveryScheduleInput = z.infer<typeof UpdateOrderDeliveryScheduleSchema>;
export type CreateOrderFollowUpInput = z.infer<typeof CreateOrderFollowUpSchema>;

export const DealerLevelSchema = z.enum(["core", "standard", "watch"]);
export const DealerStatusSchema = z.enum(["active", "suspended"]);
export const DealerSchema = EntityBaseSchema.extend({
  organizationId: IdSchema,
  code: z.string(),
  name: z.string(),
  region: z.string(),
  contact: z.string(),
  phone: z.string().nullable(),
  email: z.email().nullable(),
  level: DealerLevelSchema,
  settlementRatePercent: z.number().int().min(0).max(100),
  discountRate: z.number().int().min(0).max(100),
  status: DealerStatusSchema,
  lastActiveAt: IsoDateTimeSchema.nullable()
});
export const CreateDealerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  code: z.string().trim().min(1).max(50).optional().default(""),
  region: z.string().trim().max(100).optional().default(""),
  contact: z.string().trim().max(200).optional().default(""),
  phone: z.string().trim().min(6).max(32),
  password: z.string().min(6).max(12),
  email: z.email().optional(),
  level: DealerLevelSchema.default("standard"),
  settlementRatePercent: z.number().int().min(0).max(100).optional(),
  discountRate: z.number().int().min(0).max(100).default(90)
});
export const UpdateDealerSettlementRateSchema = z.object({
  settlementRatePercent: z.number().int().min(0).max(100)
});
export type Dealer = z.infer<typeof DealerSchema>;
export type CreateDealerInput = z.output<typeof CreateDealerSchema>;
export type UpdateDealerSettlementRateInput = z.infer<typeof UpdateDealerSettlementRateSchema>;

export const AccountStatusSchema = z.enum(["active", "disabled"]);
export const AccountSummarySchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  userId: IdSchema,
  name: z.string(),
  email: z.email().nullable(),
  phone: z.string().nullable(),
  role: RoleSchema,
  status: AccountStatusSchema,
  lastActiveAt: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema
});
export const UpdateAccountStatusSchema = z.object({ status: AccountStatusSchema });
export const ResetAccountPasswordSchema = z.object({ newPassword: z.string().min(6).max(12) });
export const ChangeOwnPasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(6).max(12) });
export type AccountSummary = z.infer<typeof AccountSummarySchema>;
export type AccountStatus = z.infer<typeof AccountStatusSchema>;

export const EmployeeSchema = AccountSummarySchema.extend({
  role: z.literal("factory_employee")
});
export const CreateEmployeeSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(6).max(32),
  email: z.email().optional(),
  password: z.string().min(6).max(12)
});
export const CreateOrganizationAdminSchema = CreateEmployeeSchema;
export const UpdateEmployeeStatusSchema = UpdateAccountStatusSchema;
export const EmployeeOrderSummarySchema = z.object({
  employee: EmployeeSchema,
  totalOrders: z.number().int().nonnegative(),
  totalAmountMinor: MoneyMinorSchema.nullable(),
  statusCounts: z.record(OrderStatusSchema, z.number().int().nonnegative()),
  pendingFollowUpCount: z.number().int().nonnegative(),
  latestFollowUpAt: IsoDateTimeSchema.nullable()
});
export const EmployeeFollowUpSummarySchema = z.object({
  employee: EmployeeSchema,
  totalFollowUps: z.number().int().nonnegative(),
  followedOrderCount: z.number().int().nonnegative(),
  pendingNextFollowUpCount: z.number().int().nonnegative(),
  dueTodayCount: z.number().int().nonnegative(),
  overdueCount: z.number().int().nonnegative(),
  latestFollowUpAt: IsoDateTimeSchema.nullable()
});
export type Employee = z.infer<typeof EmployeeSchema>;
export type CreateEmployeeInput = z.infer<typeof CreateEmployeeSchema>;
export type CreateOrganizationAdminInput = z.infer<typeof CreateOrganizationAdminSchema>;
export type EmployeeOrderSummary = z.infer<typeof EmployeeOrderSummarySchema>;
export type EmployeeFollowUpSummary = z.infer<typeof EmployeeFollowUpSummarySchema>;

export const PriceListStatusSchema = z.enum(["draft", "active", "expired", "archived"]);
export const PriceItemCategorySchema = z.enum(["frame", "panel", "door", "interior", "glass", "hardware"]);
export const PricingMethodSchema = z.enum(["fixed", "area", "length", "formula", "included", "composite"]);
export const PriceListSchema = EntityBaseSchema.extend({
  code: z.string(),
  name: z.string(),
  market: z.string(),
  currency: CurrencySchema,
  version: z.string(),
  itemCount: z.number().int().nonnegative(),
  effectiveFrom: z.string().date(),
  effectiveTo: z.string().date().nullable(),
  status: PriceListStatusSchema,
  publishedBy: IdSchema.nullable(),
  publishedAt: IsoDateTimeSchema.nullable()
});
export const CreatePriceListSchema = z.object({
  name: z.string().trim().min(1).max(200),
  code: z.string().trim().min(1).max(50),
  market: z.string().trim().min(1).max(100),
  currency: CurrencySchema.default("CNY"),
  version: z.string().trim().min(1).max(50),
  effectiveFrom: z.string().date()
});
export const PriceListItemSchema = EntityBaseSchema.extend({
  priceListId: IdSchema,
  materialKey: z.string().trim().min(1).max(200),
  specKey: z.string().trim().min(1).max(300),
  category: PriceItemCategorySchema,
  name: z.string(),
  specification: z.string(),
  unit: z.string(),
  pricingMethod: PricingMethodSchema,
  retailUnitPriceMinor: MoneyMinorSchema.nullable(),
  pricingRule: JsonObjectSchema.nullable(),
  note: z.string(),
  sourceRef: z.string().nullable()
});
export const SavePriceListItemSchema = z.object({
  id: IdSchema.optional(),
  materialKey: z.string().trim().min(1).max(200),
  specKey: z.string().trim().min(1).max(300),
  category: PriceItemCategorySchema,
  name: z.string().trim().min(1).max(300),
  specification: z.string().trim().max(500).default(""),
  unit: z.string().trim().min(1).max(50),
  pricingMethod: PricingMethodSchema.default("fixed"),
  retailUnitPriceMinor: MoneyMinorSchema.nullable().optional(),
  retailPriceMinor: MoneyMinorSchema.nullable().optional(),
  pricingRule: JsonObjectSchema.nullable().optional(),
  rule: JsonObjectSchema.nullable().optional(),
  note: z.string().trim().max(2000).optional(),
  remark: z.string().trim().max(2000).optional(),
  materialCode: z.string().trim().max(200).optional(),
  sourceRef: z.string().trim().max(200).nullable().optional(),
  source: z.enum(["bom", "manual"]).optional()
});
export const SavePriceListItemsSchema = z.object({ items: z.array(SavePriceListItemSchema).max(2000) }).superRefine((value, context) => {
  const keys = new Set<string>();
  value.items.forEach((item, index) => {
    const key = `${item.materialKey}\u0000${item.specKey}`;
    if (keys.has(key)) {
      context.addIssue({
        code: "custom",
        path: ["items", index, "specKey"],
        message: `Duplicate material/spec key: ${item.materialKey} / ${item.specKey}`
      });
    }
    keys.add(key);
  });
});
const OptionalImportNumberSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "string") {
    const normalized = value.replace(/[\s,]/g, "");
    if (!normalized) return undefined;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
}, z.union([z.number().finite(), z.string().trim()]).optional());
export const PriceListImportRowSchema = z.object({
  materialKey: z.string().trim().max(200).optional(),
  specKey: z.string().trim().max(300).optional(),
  canonicalName: z.string().trim().max(300).optional(),
  spec: z.string().trim().max(500).optional(),
  materialCode: z.string().trim().max(200).optional(),
  name: z.string().trim().max(300).optional(),
  specification: z.string().trim().max(500).optional(),
  color: z.string().trim().max(100).optional(),
  unit: z.string().trim().max(50).optional(),
  pricingMethod: PricingMethodSchema.optional(),
  retailUnitPrice: OptionalImportNumberSchema,
  unitPrice: OptionalImportNumberSchema,
  pricingRule: z.union([JsonObjectSchema, z.string().trim().max(2000)]).nullable().optional(),
  note: z.string().trim().max(2000).optional(),
  sourceRow: z.number().int().positive().optional(),
  page: z.number().int().nonnegative().optional(),
  raw: JsonObjectSchema.optional()
}).passthrough();
export const PriceListImportPreviewSchema = z.object({
  mode: z.literal("incremental").default("incremental"),
  rows: z.array(PriceListImportRowSchema).max(5000)
});
export const PriceListImportCommitSchema = PriceListImportPreviewSchema.extend({
  previewToken: z.string().trim().min(1).max(200).optional()
});
export const PriceListImportOutcomeSchema = z.enum(["new", "updated", "skipped", "conflict", "error"]);
export const PriceListImportPreviewRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  identity: z.string(),
  outcome: PriceListImportOutcomeSchema,
  message: z.string(),
  input: PriceListImportRowSchema.optional()
});
export const PriceListImportCountsSchema = z.object({
  new: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  conflict: z.number().int().nonnegative(),
  error: z.number().int().nonnegative()
});
export const PriceListImportPreviewResultSchema = z.object({
  previewToken: z.string().optional(),
  rows: z.array(PriceListImportPreviewRowSchema),
  counts: PriceListImportCountsSchema,
  errors: z.array(z.string())
});
export const PublishPriceListSchema = z.object({ effectiveFrom: z.string().date().optional() });
export const ClonePriceListSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  code: z.string().trim().min(1).max(50).optional(),
  version: z.string().trim().min(1).max(50).optional(),
  effectiveFrom: z.string().date().optional()
});
export const PriceListValidationSchema = z.object({
  valid: z.boolean(),
  errors: z.array(z.object({ code: z.string(), message: z.string(), itemId: IdSchema.nullable() })),
  summary: z.object({
    total: z.number().int().nonnegative(),
    priced: z.number().int().nonnegative(),
    unpriced: z.number().int().nonnegative(),
    formula: z.number().int().nonnegative(),
    coveragePercent: z.number().min(0).max(100)
  })
});
export const CalculatePricingSchema = z.object({
  configSnapshot: JsonObjectSchema,
  market: z.string().trim().min(1).max(100).optional(),
  currency: CurrencySchema.default("CNY"),
  salesMultiplierBasisPoints: SalesMultiplierBasisPointsSchema.optional()
});
export type PriceList = z.infer<typeof PriceListSchema>;
export type CreatePriceListInput = z.input<typeof CreatePriceListSchema>;
export type PriceListItem = z.infer<typeof PriceListItemSchema>;
export type SavePriceListItemInput = z.input<typeof SavePriceListItemSchema>;
export type PublishPriceListInput = z.infer<typeof PublishPriceListSchema>;
export type ClonePriceListInput = z.infer<typeof ClonePriceListSchema>;
export type PriceListValidation = z.infer<typeof PriceListValidationSchema>;
export type PriceListImportRow = z.input<typeof PriceListImportRowSchema>;
export type PriceListImportPreviewInput = z.input<typeof PriceListImportPreviewSchema>;
export type PriceListImportCommitInput = z.input<typeof PriceListImportCommitSchema>;
export type PriceListImportPreviewResult = z.infer<typeof PriceListImportPreviewResultSchema>;
export type CalculatePricingInput = z.input<typeof CalculatePricingSchema>;

export const ShipmentStatusSchema = z.enum(["pending", "shipped", "delivered", "cancelled"]);
export const ShipmentSchema = EntityBaseSchema.extend({
  orderId: IdSchema,
  shipmentNo: z.string(),
  carrier: z.string(),
  trackingNo: z.string(),
  status: ShipmentStatusSchema,
  packages: z.number().int().positive(),
  shippedAt: IsoDateTimeSchema.nullable(),
  signedAt: IsoDateTimeSchema.nullable()
});
export const CreateShipmentSchema = z.object({
  orderId: IdSchema,
  carrier: z.string().trim().min(1).max(200),
  trackingNo: z.string().trim().min(1).max(200),
  packages: z.number().int().positive(),
  shippedAt: IsoDateTimeSchema.optional()
});
export type Shipment = z.infer<typeof ShipmentSchema>;
export type CreateShipmentInput = z.infer<typeof CreateShipmentSchema>;

export const MaterialVariantSchema = EntityBaseSchema.extend({
  materialCode: z.string().trim().min(1).max(100),
  materialKey: z.string().trim().min(1).max(100),
  specKey: z.string().trim().min(1).max(100),
  category: z.string().trim().max(100),
  color: z.string().trim().max(100),
  finish: z.string().trim().max(100),
  name: z.string().trim().min(1).max(200),
  specification: z.string().trim().max(500),
  unit: z.string().trim().min(1).max(20),
  weightKg: z.number().nonnegative().nullable(),
  referenceCostMinor: z.number().int().nonnegative().nullable(),
  note: z.string().trim().max(1000),
  source: z.string().trim().max(100),
  active: z.boolean()
});
export const CreateMaterialVariantSchema = z.object({
  materialCode: z.string().trim().min(1).max(100).optional(),
  materialKey: z.string().trim().min(1).max(100),
  specKey: z.string().trim().min(1).max(100),
  category: z.string().trim().max(100).optional(),
  color: z.string().trim().max(100).optional(),
  finish: z.string().trim().max(100).optional(),
  name: z.string().trim().min(1).max(200),
  specification: z.string().trim().max(500).optional(),
  unit: z.string().trim().min(1).max(20).optional(),
  weightKg: z.number().nonnegative().nullable().optional(),
  referenceCostMinor: z.number().int().nonnegative().nullable().optional(),
  note: z.string().trim().max(1000).optional(),
  source: z.string().trim().max(100).optional(),
  active: z.boolean().optional()
});
export type MaterialVariant = z.infer<typeof MaterialVariantSchema>;
export type CreateMaterialVariantInput = z.input<typeof CreateMaterialVariantSchema>;

export const WarehouseSchema = EntityBaseSchema.extend({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(200),
  isDefault: z.boolean()
});
export const CreateWarehouseSchema = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(200),
  isDefault: z.boolean().optional()
});
export type Warehouse = z.infer<typeof WarehouseSchema>;
export type CreateWarehouseInput = z.input<typeof CreateWarehouseSchema>;

export const InventoryBalanceSchema = EntityBaseSchema.extend({
  warehouseId: IdSchema,
  materialId: IdSchema,
  materialKey: z.string(),
  specKey: z.string(),
  color: z.string(),
  finish: z.string(),
  onHandQty: z.number().int().nonnegative(),
  reservedQty: z.number().int().nonnegative(),
  availableQty: z.number().int().nonnegative()
});
export type InventoryBalance = z.infer<typeof InventoryBalanceSchema>;

export const InventoryLedgerDirectionSchema = z.enum(["receive", "issue", "adjust", "reserve", "release", "reverse"]);
export const InventoryLedgerSchema = EntityBaseSchema.extend({
  warehouseId: IdSchema,
  materialId: IdSchema,
  direction: InventoryLedgerDirectionSchema,
  quantity: z.number().int().positive(),
  deltaQty: z.number().int(),
  referenceType: z.string().trim().min(1).max(50),
  referenceId: IdSchema.nullable(),
  note: z.string().nullable(),
  actorUserId: IdSchema.nullable()
});
export type InventoryLedger = z.infer<typeof InventoryLedgerSchema>;

export const StockDocumentTypeSchema = z.enum(["receive", "issue", "adjust", "transfer"]);
export const StockDocumentStatusSchema = z.enum(["draft", "posted", "reversed"]);
export const StockDocumentLineSchema = z.object({
  materialId: IdSchema.optional(),
  materialKey: z.string().trim().min(1).max(100),
  specKey: z.string().trim().min(1).max(100),
  color: z.string().trim().max(100).optional(),
  finish: z.string().trim().max(100).optional(),
  qty: z.number().int().positive(),
  note: z.string().trim().max(500).optional()
});
export const StockDocumentSchema = EntityBaseSchema.extend({
  code: z.string(),
  type: StockDocumentTypeSchema,
  status: StockDocumentStatusSchema,
  warehouseId: IdSchema,
  targetWarehouseId: IdSchema.nullable(),
  orderId: IdSchema.nullable(),
  sourceBatchId: z.string().trim().max(100).nullable(),
  note: z.string().nullable(),
  lines: z.array(StockDocumentLineSchema),
  postedAt: IsoDateTimeSchema.nullable(),
  postedByUserId: IdSchema.nullable()
});
export const CreateStockDocumentSchema = z.object({
  type: StockDocumentTypeSchema,
  warehouseId: IdSchema.optional(),
  targetWarehouseId: IdSchema.optional(),
  orderId: IdSchema.optional(),
  sourceBatchId: z.string().trim().min(1).max(100).optional(),
  note: z.string().trim().max(500).optional(),
  lines: z.array(StockDocumentLineSchema).min(1).max(1000)
});
export type StockDocument = z.infer<typeof StockDocumentSchema>;
export type CreateStockDocumentInput = z.input<typeof CreateStockDocumentSchema>;

export const InventoryRequirementSchema = z.object({
  materialId: IdSchema.optional(),
  materialKey: z.string().trim().min(1).max(100),
  specKey: z.string().trim().min(1).max(100),
  color: z.string().trim().max(100).optional(),
  finish: z.string().trim().max(100).optional(),
  qty: z.number().int().positive()
});
export const InventoryReservationSchema = EntityBaseSchema.extend({
  orderId: IdSchema,
  warehouseId: IdSchema,
  materialId: IdSchema,
  qty: z.number().int().positive(),
  issuedQty: z.number().int().nonnegative(),
  releasedQty: z.number().int().nonnegative(),
  status: z.enum(["active", "released", "consumed"])
});
export const CreateInventoryReservationSchema = z.object({
  orderId: IdSchema,
  warehouseId: IdSchema.optional(),
  requirements: z.array(InventoryRequirementSchema).min(1).max(1000)
});
export type InventoryRequirement = z.input<typeof InventoryRequirementSchema>;
export type InventoryReservation = z.infer<typeof InventoryReservationSchema>;
export type CreateInventoryReservationInput = z.input<typeof CreateInventoryReservationSchema>;

export const MaterialImportRowSchema = z.object({
  materialCode: z.string().trim().min(1).max(100).optional(),
  materialKey: z.string().trim().min(1).max(100),
  specKey: z.string().trim().min(1).max(100),
  category: z.string().trim().max(100).optional(),
  color: z.string().trim().max(100).optional(),
  finish: z.string().trim().max(100).optional(),
  name: z.string().trim().min(1).max(200),
  specification: z.string().trim().max(500).optional(),
  unit: z.string().trim().min(1).max(20).optional(),
  weightKg: z.number().nonnegative().optional(),
  referenceCost: z.number().nonnegative().optional(),
  active: z.boolean().optional(),
  note: z.string().trim().max(1000).optional(),
  source: z.string().trim().max(100).optional(),
  openingQty: z.number().int().nonnegative().optional()
});
export const OpeningInventoryImportRowSchema = z.object({
  warehouseCode: z.string().trim().min(1).max(50),
  materialCode: z.string().trim().min(1).max(100),
  openingQty: z.number().int().nonnegative(),
  location: z.string().trim().max(100).optional(),
  batchNo: z.string().trim().max(100).optional(),
  note: z.string().trim().max(1000).optional()
});
export const MaterialImportPreviewSchema = z.object({
  materialRows: z.array(z.unknown()).max(10000).optional(),
  openingRows: z.array(z.unknown()).max(10000).optional(),
  rows: z.array(z.unknown()).max(10000).optional()
}).refine((value) => Boolean(value.materialRows?.length || value.openingRows?.length || value.rows?.length), { message: "Import contains no rows" });
export const MaterialImportCommitSchema = z.object({
  materialRows: z.array(MaterialImportRowSchema).max(10000).optional(),
  openingRows: z.array(OpeningInventoryImportRowSchema).max(10000).optional(),
  rows: z.array(MaterialImportRowSchema).max(10000).optional(),
  warehouseId: IdSchema.optional(),
  source: z.string().trim().max(100).optional(),
  batchId: z.string().trim().min(1).max(100).optional()
}).refine((value) => Boolean(value.materialRows?.length || value.openingRows?.length || value.rows?.length), { message: "Import contains no rows" });
export type MaterialImportRow = z.input<typeof MaterialImportRowSchema>;
export type OpeningInventoryImportRow = z.input<typeof OpeningInventoryImportRowSchema>;
export type MaterialImportPreviewInput = z.input<typeof MaterialImportPreviewSchema>;
export type MaterialImportCommitInput = z.input<typeof MaterialImportCommitSchema>;

export const AttachmentSchema = EntityBaseSchema.extend({
  entityType: z.string(),
  entityId: IdSchema,
  fileName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  objectKey: z.string(),
  uploadPending: z.boolean(),
  createdBy: IdSchema,
  metadata: JsonObjectSchema
});
export const CreateAttachmentSchema = z.object({
  entityType: z.string().trim().min(1).max(100),
  entityId: IdSchema,
  fileName: z.string().trim().min(1).max(500),
  contentType: z.string().trim().min(1).max(200),
  sizeBytes: z.number().int().nonnegative(),
  metadata: JsonObjectSchema.default({})
});
export type Attachment = z.infer<typeof AttachmentSchema>;
export type CreateAttachmentInput = z.input<typeof CreateAttachmentSchema>;

export const AuditLogSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  actorUserId: IdSchema.nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: IdSchema,
  requestId: z.string(),
  before: JsonObjectSchema.nullable(),
  after: JsonObjectSchema.nullable(),
  metadata: JsonObjectSchema,
  createdAt: IsoDateTimeSchema
});
export type AuditLog = z.infer<typeof AuditLogSchema>;

export const ItemEnvelope = <T extends z.ZodType>(schema: T) => z.object({ item: schema });
export const ListEnvelope = <T extends z.ZodType>(schema: T) => z.object({
  items: z.array(schema),
  nextCursor: z.string().nullable().default(null)
});

export type DesignVersion = z.infer<typeof DesignVersionSchema>;
export type CreateQuoteInput = z.input<typeof CreateQuoteSchema>;
export type CreateProjectQuoteInput = z.infer<typeof CreateProjectQuoteSchema>;
export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;
export type QuoteTransitionInput = z.infer<typeof QuoteTransitionSchema>;
export type OrderTransitionInput = z.infer<typeof OrderTransitionSchema>;
