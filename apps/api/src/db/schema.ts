import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex
} from "drizzle-orm/pg-core";

export const customerStatusEnum = pgEnum("customer_status", ["active", "inactive"]);
export const projectStatusEnum = pgEnum("project_status", [
  "lead",
  "designing",
  "quoted",
  "won",
  "lost",
  "on_hold",
  "closed"
]);
export const templateStatusEnum = pgEnum("template_status", ["draft", "published", "archived"]);
export const designStatusEnum = pgEnum("design_status", ["draft", "review", "approved", "archived"]);
export const quoteStatusEnum = pgEnum("quote_status", [
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
export const quoteLinePricingStatusEnum = pgEnum("quote_line_pricing_status", [
  "priced",
  "included",
  "unmatched"
]);
export const orderStatusEnum = pgEnum("order_status", [
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
export const dealerLevelEnum = pgEnum("dealer_level", ["core", "standard", "watch"]);
export const dealerStatusEnum = pgEnum("dealer_status", ["active", "suspended"]);
export const accountStatusEnum = pgEnum("account_status", ["active", "disabled"]);
export const priceListStatusEnum = pgEnum("price_list_status", ["draft", "active", "expired", "archived"]);
export const priceItemCategoryEnum = pgEnum("price_item_category", ["frame", "panel", "door", "interior", "glass", "hardware"]);
export const pricingMethodEnum = pgEnum("pricing_method", ["fixed", "area", "length", "formula", "included", "composite"]);
export const shipmentStatusEnum = pgEnum("shipment_status", ["pending", "shipped", "delivered", "cancelled"]);
export const organizationTypeEnum = pgEnum("organization_type", ["hq", "dealer"]);
// Better Auth core + admin plugin compatible user model.
export const users = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phoneNumber: text("phone_number"),
  phoneNumberVerified: boolean("phone_number_verified").notNull().default(false),
  username: text("username"),
  displayUsername: text("display_username"),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: text("role").notNull().default("user"),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  banned: boolean("banned").notNull().default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("user_email_unique").on(table.email),
  uniqueIndex("user_phone_number_unique").on(table.phoneNumber),
  uniqueIndex("user_username_unique").on(table.username)
]);

export const organizations = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  logo: text("logo"),
  metadata: text("metadata"),
  plan: text("plan").notNull().default("standard"),
  organizationType: organizationTypeEnum("organization_type").notNull().default("hq"),
  parentOrganizationId: text("parent_organization_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("organization_slug_unique").on(table.slug),
  index("organization_parent_idx").on(table.parentOrganizationId)
]);

export const sessions = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  activeOrganizationId: text("active_organization_id").references(() => organizations.id, { onDelete: "set null" }),
  impersonatedBy: text("impersonated_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("session_token_unique").on(table.token),
  index("session_user_id_idx").on(table.userId),
  index("session_active_organization_id_idx").on(table.activeOrganizationId),
  index("session_expires_at_idx").on(table.expiresAt)
]);

export const accounts = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("account_provider_account_unique").on(table.providerId, table.accountId),
  index("account_user_id_idx").on(table.userId)
]);

export const verifications = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  index("verification_identifier_idx").on(table.identifier),
  index("verification_expires_at_idx").on(table.expiresAt)
]);

export const members = pgTable("member", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  permissionConfigured: boolean("permission_configured").notNull().default(false),
  status: accountStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("member_organization_user_unique").on(table.organizationId, table.userId),
  uniqueIndex("member_id_organization_unique").on(table.id, table.organizationId),
  index("member_user_id_idx").on(table.userId)
]);

export const salesPricingPreferences = pgTable("sales_pricing_preferences", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  salesMultiplierBasisPoints: integer("sales_multiplier_basis_points").notNull().default(15000),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("sales_pricing_preferences_org_user_unique").on(table.organizationId, table.userId),
  index("sales_pricing_preferences_user_idx").on(table.userId),
  check("sales_pricing_preferences_multiplier_range", sql`${table.salesMultiplierBasisPoints} >= 10000 AND ${table.salesMultiplierBasisPoints} <= 99900`)
]);

/** Fine-grained authorization data. Legacy member.role remains as a migration hint only. */
export const organizationEntitlements = pgTable("organization_entitlements", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  module: text("module").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  permissionAllowlist: jsonb("permission_allowlist").$type<string[] | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("organization_entitlements_org_module_unique").on(table.organizationId, table.module),
  index("organization_entitlements_org_idx").on(table.organizationId)
]);

export const memberPermissionGrants = pgTable("member_permission_grants", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  memberId: text("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
  permission: text("permission").notNull(),
  scope: text("scope").notNull().default("organization"),
  assignedUserIds: jsonb("assigned_user_ids").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("member_permission_grants_member_permission_unique").on(table.memberId, table.permission),
  foreignKey({
    columns: [table.memberId, table.organizationId],
    foreignColumns: [members.id, members.organizationId],
    name: "member_permission_grants_member_organization_fk"
  }).onDelete("cascade"),
  index("member_permission_grants_org_idx").on(table.organizationId),
  index("member_permission_grants_member_idx").on(table.memberId)
]);

export const memberDataScopes = pgTable("member_data_scopes", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  memberId: text("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
  resource: text("resource").notNull(),
  scope: text("scope").notNull().default("organization"),
  assignedUserIds: jsonb("assigned_user_ids").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("member_data_scopes_member_resource_unique").on(table.memberId, table.resource),
  foreignKey({
    columns: [table.memberId, table.organizationId],
    foreignColumns: [members.id, members.organizationId],
    name: "member_data_scopes_member_organization_fk"
  }).onDelete("cascade"),
  index("member_data_scopes_org_idx").on(table.organizationId),
  index("member_data_scopes_member_idx").on(table.memberId)
]);

export const authorizationAuditLogs = pgTable("authorization_audit_logs", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  targetMemberId: text("target_member_id").references(() => members.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  before: jsonb("before").$type<Record<string, unknown> | null>(),
  after: jsonb("after").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  index("authorization_audit_logs_org_created_idx").on(table.organizationId, table.createdAt),
  index("authorization_audit_logs_target_idx").on(table.targetMemberId)
]);

export const invitations = pgTable("invitation", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role").notNull().default("member"),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  inviterId: text("inviter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  index("invitation_organization_id_idx").on(table.organizationId),
  index("invitation_email_idx").on(table.email),
  index("invitation_expires_at_idx").on(table.expiresAt)
]);

export const dealerOrganizations = pgTable("dealer_organizations", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  region: text("region").notNull(),
  contact: text("contact").notNull(),
  phone: text("phone"),
  email: text("email"),
  level: dealerLevelEnum("level").notNull().default("standard"),
  settlementRatePercent: integer("settlement_rate_percent").notNull().default(90),
  discountRate: integer("discount_rate").notNull().default(90),
  status: dealerStatusEnum("status").notNull().default("active"),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("dealer_organizations_tenant_id_id_unique").on(table.tenantId, table.id),
  uniqueIndex("dealer_organizations_organization_unique").on(table.organizationId),
  uniqueIndex("dealer_organizations_tenant_code_unique").on(table.tenantId, table.code),
  index("dealer_organizations_tenant_status_idx").on(table.tenantId, table.status),
  check("dealer_organizations_discount_rate_range", sql`${table.discountRate} between 0 and 100`),
  check("dealer_organizations_settlement_rate_range", sql`${table.settlementRatePercent} between 0 and 100`),
  check("dealer_organizations_revision_positive", sql`${table.revision} > 0`)
]);

export const customers = pgTable("customers", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  companyName: text("company_name"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  status: customerStatusEnum("status").notNull().default("active"),
  revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("customers_tenant_id_id_unique").on(table.tenantId, table.id),
  uniqueIndex("customers_tenant_code_unique").on(table.tenantId, table.code),
  index("customers_tenant_created_by_idx").on(table.tenantId, table.createdByUserId),
  index("customers_tenant_name_idx").on(table.tenantId, table.name),
  index("customers_tenant_status_idx").on(table.tenantId, table.status),
  check("customers_revision_positive", sql`${table.revision} > 0`)
]);

export const priceLists = pgTable("price_lists", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  market: text("market").notNull(),
  currency: text("currency").notNull().default("CNY"),
  version: text("version").notNull(),
  itemCount: integer("item_count").notNull().default(0),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  status: priceListStatusEnum("status").notNull().default("draft"),
  publishedBy: text("published_by").references(() => users.id, { onDelete: "set null" }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("price_lists_tenant_id_id_unique").on(table.tenantId, table.id),
  uniqueIndex("price_lists_tenant_code_version_unique").on(table.tenantId, table.code, table.version),
  index("price_lists_tenant_status_idx").on(table.tenantId, table.status),
  check("price_lists_currency_length", sql`char_length(${table.currency}) = 3`),
  check("price_lists_item_count_nonnegative", sql`${table.itemCount} >= 0`),
  check("price_lists_revision_positive", sql`${table.revision} > 0`)
]);

export const priceListItems = pgTable("price_list_items", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  priceListId: text("price_list_id").notNull(),
  materialKey: text("material_key").notNull(),
  specKey: text("spec_key").notNull(),
  category: priceItemCategoryEnum("category").notNull(),
  name: text("name").notNull(),
  specification: text("specification").notNull().default(""),
  unit: text("unit").notNull(),
  pricingMethod: pricingMethodEnum("pricing_method").notNull().default("fixed"),
  retailUnitPriceMinor: bigint("retail_unit_price_minor", { mode: "number" }),
  pricingRule: jsonb("pricing_rule").$type<Record<string, unknown>>(),
  note: text("note").notNull().default(""),
  sourceRef: text("source_ref"),
  revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("price_list_items_tenant_id_id_unique").on(table.tenantId, table.id),
  uniqueIndex("price_list_items_list_material_spec_unique").on(table.tenantId, table.priceListId, table.materialKey, table.specKey),
  index("price_list_items_tenant_list_idx").on(table.tenantId, table.priceListId),
  index("price_list_items_material_spec_idx").on(table.materialKey, table.specKey),
  foreignKey({
    columns: [table.tenantId, table.priceListId],
    foreignColumns: [priceLists.tenantId, priceLists.id],
    name: "price_list_items_tenant_price_list_fk"
  }).onDelete("cascade"),
  check("price_list_items_revision_positive", sql`${table.revision} > 0`),
  check("price_list_items_price_nonnegative", sql`${table.retailUnitPriceMinor} is null or ${table.retailUnitPriceMinor} >= 0`)
]);

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  code: text("code").notNull(),
  customerId: text("customer_id"),
  name: text("name").notNull(),
  status: projectStatusEnum("status").notNull().default("lead"),
  ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "set null" }),
  description: text("description"),
  targetDate: date("target_date"),
  revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("projects_tenant_id_id_unique").on(table.tenantId, table.id),
  uniqueIndex("projects_tenant_code_unique").on(table.tenantId, table.code),
  index("projects_tenant_status_idx").on(table.tenantId, table.status),
  index("projects_tenant_customer_idx").on(table.tenantId, table.customerId),
  index("projects_tenant_updated_at_idx").on(table.tenantId, table.updatedAt),
  index("projects_tenant_created_by_idx").on(table.tenantId, table.createdByUserId),
  foreignKey({
    columns: [table.tenantId, table.customerId],
    foreignColumns: [customers.tenantId, customers.id],
    name: "projects_tenant_customer_fk"
  }).onDelete("restrict"),
  check("projects_revision_positive", sql`${table.revision} > 0`)
]);

export const templates = pgTable("templates", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  status: templateStatusEnum("status").notNull().default("draft"),
  revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("templates_tenant_id_id_unique").on(table.tenantId, table.id),
  uniqueIndex("templates_tenant_code_unique").on(table.tenantId, table.code),
  index("templates_tenant_status_idx").on(table.tenantId, table.status),
  check("templates_revision_positive", sql`${table.revision} > 0`)
]);

export const templateVersions = pgTable("template_versions", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  templateId: text("template_id").notNull(),
  version: integer("version").notNull(),
  name: text("name").notNull(),
  configSnapshot: jsonb("config_snapshot").$type<Record<string, unknown>>().notNull().default({}),
  bomSnapshot: jsonb("bom_snapshot").$type<Array<Record<string, unknown>>>().notNull().default([]),
  pricingSnapshot: jsonb("pricing_snapshot").$type<Record<string, unknown>>().notNull().default({}),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("template_versions_tenant_id_id_unique").on(table.tenantId, table.id),
  uniqueIndex("template_versions_tenant_template_version_unique").on(table.tenantId, table.templateId, table.version),
  index("template_versions_tenant_published_at_idx").on(table.tenantId, table.publishedAt),
  foreignKey({
    columns: [table.tenantId, table.templateId],
    foreignColumns: [templates.tenantId, templates.id],
    name: "template_versions_tenant_template_fk"
  }).onDelete("cascade"),
  check("template_versions_version_positive", sql`${table.version} > 0`)
]);

export const designs = pgTable("designs", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  code: text("code").notNull(),
  projectId: text("project_id").notNull(),
  name: text("name").notNull(),
  templateVersionId: text("template_version_id"),
  status: designStatusEnum("status").notNull().default("draft"),
  draftRevision: integer("draft_revision").notNull().default(1),
  configSnapshot: jsonb("config_snapshot").$type<Record<string, unknown>>().notNull().default({}),
  bomSnapshot: jsonb("bom_snapshot").$type<Array<Record<string, unknown>>>().notNull().default([]),
  pricingSnapshot: jsonb("pricing_snapshot").$type<Record<string, unknown>>().notNull().default({}),
  revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("designs_tenant_id_id_unique").on(table.tenantId, table.id),
  uniqueIndex("designs_tenant_code_unique").on(table.tenantId, table.code),
  index("designs_tenant_project_idx").on(table.tenantId, table.projectId),
  index("designs_tenant_status_idx").on(table.tenantId, table.status),
  index("designs_tenant_created_by_idx").on(table.tenantId, table.createdByUserId),
  foreignKey({
    columns: [table.tenantId, table.projectId],
    foreignColumns: [projects.tenantId, projects.id],
    name: "designs_tenant_project_fk"
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.tenantId, table.templateVersionId],
    foreignColumns: [templateVersions.tenantId, templateVersions.id],
    name: "designs_tenant_template_version_fk"
  }).onDelete("restrict"),
  check("designs_draft_revision_positive", sql`${table.draftRevision} > 0`),
  check("designs_revision_positive", sql`${table.revision} > 0`)
]);

export const designVersions = pgTable("design_versions", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  designId: text("design_id").notNull(),
  version: integer("version").notNull(),
  sourceDraftRevision: integer("source_draft_revision").notNull(),
  configSnapshot: jsonb("config_snapshot").$type<Record<string, unknown>>().notNull(),
  bomSnapshot: jsonb("bom_snapshot").$type<Array<Record<string, unknown>>>().notNull(),
  pricingSnapshot: jsonb("pricing_snapshot").$type<Record<string, unknown>>().notNull(),
  note: text("note"),
  createdBy: text("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("design_versions_tenant_id_id_unique").on(table.tenantId, table.id),
  uniqueIndex("design_versions_tenant_design_version_unique").on(table.tenantId, table.designId, table.version),
  index("design_versions_tenant_created_at_idx").on(table.tenantId, table.createdAt),
  foreignKey({
    columns: [table.tenantId, table.designId],
    foreignColumns: [designs.tenantId, designs.id],
    name: "design_versions_tenant_design_fk"
  }).onDelete("cascade"),
  check("design_versions_version_positive", sql`${table.version} > 0`),
  check("design_versions_source_revision_positive", sql`${table.sourceDraftRevision} > 0`)
]);

export const quotes = pgTable("quotes", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  code: text("code").notNull(),
  projectId: text("project_id").notNull(),
  customerId: text("customer_id"),
  designVersionId: text("design_version_id").notNull(),
  status: quoteStatusEnum("status").notNull().default("draft"),
  currency: text("currency").notNull().default("CNY"),
  subtotalMinor: bigint("subtotal_minor", { mode: "number" }).notNull().default(0),
  discountMinor: bigint("discount_minor", { mode: "number" }).notNull().default(0),
  taxRateBasisPoints: integer("tax_rate_basis_points").notNull().default(0),
  taxMinor: bigint("tax_minor", { mode: "number" }).notNull().default(0),
  totalMinor: bigint("total_minor", { mode: "number" }).notNull().default(0),
  basePriceTotalMinor: bigint("base_price_total_minor", { mode: "number" }),
  salesMultiplierBasisPoints: integer("sales_multiplier_basis_points"),
  multiplierQuoteTotalMinor: bigint("multiplier_quote_total_minor", { mode: "number" }),
  validUntil: date("valid_until"),
  notes: text("notes"),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull().default({}),
  revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("quotes_tenant_id_id_unique").on(table.tenantId, table.id),
  uniqueIndex("quotes_tenant_code_unique").on(table.tenantId, table.code),
  index("quotes_tenant_project_idx").on(table.tenantId, table.projectId),
  index("quotes_tenant_status_idx").on(table.tenantId, table.status),
  index("quotes_tenant_customer_idx").on(table.tenantId, table.customerId),
  index("quotes_tenant_created_by_idx").on(table.tenantId, table.createdByUserId),
  foreignKey({
    columns: [table.tenantId, table.projectId],
    foreignColumns: [projects.tenantId, projects.id],
    name: "quotes_tenant_project_fk"
  }).onDelete("restrict"),
  foreignKey({
    columns: [table.tenantId, table.customerId],
    foreignColumns: [customers.tenantId, customers.id],
    name: "quotes_tenant_customer_fk"
  }).onDelete("restrict"),
  foreignKey({
    columns: [table.tenantId, table.designVersionId],
    foreignColumns: [designVersions.tenantId, designVersions.id],
    name: "quotes_tenant_design_version_fk"
  }).onDelete("restrict"),
  check("quotes_revision_positive", sql`${table.revision} > 0`),
  check("quotes_currency_length", sql`char_length(${table.currency}) = 3`),
  check("quotes_subtotal_nonnegative", sql`${table.subtotalMinor} >= 0`),
  check("quotes_discount_nonnegative", sql`${table.discountMinor} >= 0`),
  check("quotes_tax_nonnegative", sql`${table.taxMinor} >= 0`),
  check("quotes_total_nonnegative", sql`${table.totalMinor} >= 0`),
  check("quotes_tax_rate_range", sql`${table.taxRateBasisPoints} between 0 and 10000`)
]);

export const quoteLines = pgTable("quote_lines", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  quoteId: text("quote_id").notNull(),
  position: integer("position").notNull(),
  sourceRef: text("source_ref").notNull(),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 18, scale: 4, mode: "number" }).notNull(),
  unitPriceMinor: bigint("unit_price_minor", { mode: "number" }).notNull(),
  lineTotalMinor: bigint("line_total_minor", { mode: "number" }).notNull(),
  pricingStatus: quoteLinePricingStatusEnum("pricing_status").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("quote_lines_tenant_id_id_unique").on(table.tenantId, table.id),
  uniqueIndex("quote_lines_tenant_quote_position_unique").on(table.tenantId, table.quoteId, table.position),
  index("quote_lines_tenant_quote_idx").on(table.tenantId, table.quoteId),
  foreignKey({
    columns: [table.tenantId, table.quoteId],
    foreignColumns: [quotes.tenantId, quotes.id],
    name: "quote_lines_tenant_quote_fk"
  }).onDelete("cascade"),
  check("quote_lines_position_nonnegative", sql`${table.position} >= 0`),
  check("quote_lines_quantity_positive", sql`${table.quantity} > 0`),
  check("quote_lines_unit_price_nonnegative", sql`${table.unitPriceMinor} >= 0`),
  check("quote_lines_total_nonnegative", sql`${table.lineTotalMinor} >= 0`)
]);

export const orders = pgTable("orders", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  code: text("code").notNull(),
  projectId: text("project_id").notNull(),
  customerId: text("customer_id"),
  acceptedQuoteId: text("accepted_quote_id").notNull(),
  status: orderStatusEnum("status").notNull().default("draft"),
  currency: text("currency").notNull().default("CNY"),
  totalMinor: bigint("total_minor", { mode: "number" }).notNull(),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
  customerConfirmedAt: timestamp("customer_confirmed_at", { withTimezone: true }),
  deliveryLeadTimeDays: integer("delivery_lead_time_days").notNull().default(30),
  expectedDeliveryDate: date("expected_delivery_date"),
  productionNote: text("production_note"),
  shippingNote: text("shipping_note"),
  ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "set null" }),
  assignedAt: timestamp("assigned_at", { withTimezone: true }),
  assignedByUserId: text("assigned_by_user_id").references(() => users.id, { onDelete: "set null" }),
  revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("orders_tenant_id_id_unique").on(table.tenantId, table.id),
  uniqueIndex("orders_tenant_code_unique").on(table.tenantId, table.code),
  uniqueIndex("orders_tenant_accepted_quote_unique").on(table.tenantId, table.acceptedQuoteId),
  index("orders_tenant_project_idx").on(table.tenantId, table.projectId),
  index("orders_tenant_status_idx").on(table.tenantId, table.status),
  index("orders_tenant_owner_idx").on(table.tenantId, table.ownerUserId),
  index("orders_tenant_created_by_idx").on(table.tenantId, table.createdByUserId),
  foreignKey({
    columns: [table.tenantId, table.projectId],
    foreignColumns: [projects.tenantId, projects.id],
    name: "orders_tenant_project_fk"
  }).onDelete("restrict"),
  foreignKey({
    columns: [table.tenantId, table.customerId],
    foreignColumns: [customers.tenantId, customers.id],
    name: "orders_tenant_customer_fk"
  }).onDelete("restrict"),
  foreignKey({
    columns: [table.tenantId, table.acceptedQuoteId],
    foreignColumns: [quotes.tenantId, quotes.id],
    name: "orders_tenant_accepted_quote_fk"
  }).onDelete("restrict"),
  check("orders_revision_positive", sql`${table.revision} > 0`),
  check("orders_currency_length", sql`char_length(${table.currency}) = 3`),
  check("orders_total_nonnegative", sql`${table.totalMinor} >= 0`)
]);

export const orderAssignments = pgTable("order_assignments", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  orderId: text("order_id").notNull(),
  previousOwnerUserId: text("previous_owner_user_id").references(() => users.id, { onDelete: "set null" }),
  ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "set null" }),
  assignedByUserId: text("assigned_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("order_assignments_tenant_id_id_unique").on(table.tenantId, table.id),
  index("order_assignments_tenant_order_idx").on(table.tenantId, table.orderId),
  index("order_assignments_tenant_owner_idx").on(table.tenantId, table.ownerUserId),
  foreignKey({
    columns: [table.tenantId, table.orderId],
    foreignColumns: [orders.tenantId, orders.id],
    name: "order_assignments_tenant_order_fk"
  }).onDelete("cascade")
]);

export const orderFollowUps = pgTable("order_follow_ups", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  orderId: text("order_id").notNull(),
  authorUserId: text("author_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  content: text("content").notNull(),
  nextFollowUpAt: timestamp("next_follow_up_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("order_follow_ups_tenant_id_id_unique").on(table.tenantId, table.id),
  index("order_follow_ups_tenant_order_idx").on(table.tenantId, table.orderId),
  index("order_follow_ups_tenant_author_idx").on(table.tenantId, table.authorUserId),
  index("order_follow_ups_tenant_next_follow_up_idx").on(table.tenantId, table.nextFollowUpAt),
  foreignKey({
    columns: [table.tenantId, table.orderId],
    foreignColumns: [orders.tenantId, orders.id],
    name: "order_follow_ups_tenant_order_fk"
  }).onDelete("cascade")
]);

export const shipments = pgTable("shipments", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  orderId: text("order_id").notNull(),
  shipmentNo: text("shipment_no").notNull(),
  carrier: text("carrier").notNull(),
  trackingNo: text("tracking_no").notNull(),
  status: shipmentStatusEnum("status").notNull().default("pending"),
  packages: integer("packages").notNull(),
  shippedAt: timestamp("shipped_at", { withTimezone: true }),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("shipments_tenant_id_id_unique").on(table.tenantId, table.id),
  uniqueIndex("shipments_tenant_number_unique").on(table.tenantId, table.shipmentNo),
  index("shipments_tenant_order_idx").on(table.tenantId, table.orderId),
  foreignKey({
    columns: [table.tenantId, table.orderId],
    foreignColumns: [orders.tenantId, orders.id],
    name: "shipments_tenant_order_fk"
  }).onDelete("cascade"),
  check("shipments_packages_positive", sql`${table.packages} > 0`),
  check("shipments_revision_positive", sql`${table.revision} > 0`)
]);

export const attachments = pgTable("attachments", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  objectKey: text("object_key").notNull(),
  uploadPending: boolean("upload_pending").notNull().default(true),
  createdBy: text("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("attachments_tenant_id_id_unique").on(table.tenantId, table.id),
  uniqueIndex("attachments_tenant_object_key_unique").on(table.tenantId, table.objectKey),
  index("attachments_tenant_entity_idx").on(table.tenantId, table.entityType, table.entityId),
  check("attachments_size_nonnegative", sql`${table.sizeBytes} >= 0`),
  check("attachments_revision_positive", sql`${table.revision} > 0`)
]);

export const auditLogs = pgTable("audit_logs", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  requestId: text("request_id").notNull(),
  before: jsonb("before").$type<Record<string, unknown>>(),
  after: jsonb("after").$type<Record<string, unknown>>(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  index("audit_logs_tenant_created_at_idx").on(table.tenantId, table.createdAt),
  index("audit_logs_tenant_entity_idx").on(table.tenantId, table.entityType, table.entityId),
  index("audit_logs_tenant_actor_idx").on(table.tenantId, table.actorUserId),
  index("audit_logs_request_id_idx").on(table.requestId)
]);

export const idempotencyKeys = pgTable("idempotency_keys", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  key: text("idempotency_key").notNull(),
  route: text("route").notNull(),
  requestHash: text("request_hash").notNull(),
  statusCode: integer("status_code").notNull(),
  response: jsonb("response").$type<unknown>().notNull(),
  resourceType: text("resource_type"),
  resourceId: text("resource_id"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("idempotency_keys_tenant_route_key_unique").on(table.tenantId, table.route, table.key),
  index("idempotency_keys_expires_at_idx").on(table.expiresAt)
]);

export const loginLogs = pgTable("login_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tenantId: text("tenant_id").references(() => organizations.id, { onDelete: "set null" }),
  accountIdentifier: text("account_identifier"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  index("login_logs_user_created_idx").on(table.userId, table.createdAt),
  index("login_logs_tenant_created_idx").on(table.tenantId, table.createdAt)
]);

export const stockDocumentTypeEnum = pgEnum("stock_document_type", ["receive", "issue", "adjust", "transfer"]);
export const stockDocumentStatusEnum = pgEnum("stock_document_status", ["draft", "posted", "reversed"]);
export const inventoryLedgerDirectionEnum = pgEnum("inventory_ledger_direction", ["receive", "issue", "adjust", "reserve", "release", "reverse"]);

export const warehouses = pgTable("warehouses", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  code: text("code").notNull(), name: text("name").notNull(), isDefault: boolean("is_default").notNull().default(false),
  revision: integer("revision").notNull().default(1), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex("warehouses_tenant_code_unique").on(table.tenantId, table.code), index("warehouses_tenant_idx").on(table.tenantId)]);

export const materialVariants = pgTable("material_variants", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  materialCode: text("material_code").notNull(), materialKey: text("material_key").notNull(), specKey: text("spec_key").notNull(), category: text("category").notNull().default(""), color: text("color").notNull().default(""), finish: text("finish").notNull().default(""),
  name: text("name").notNull(), specification: text("specification").notNull().default(""), unit: text("unit").notNull().default("pcs"), weightKg: numeric("weight_kg", { precision: 12, scale: 4, mode: "number" }), referenceCostMinor: integer("reference_cost_minor"), note: text("note").notNull().default(""), source: text("source").notNull().default(""), active: boolean("active").notNull().default(true),
  revision: integer("revision").notNull().default(1), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex("material_variants_tenant_code_unique").on(table.tenantId, table.materialCode), uniqueIndex("material_variants_tenant_key_unique").on(table.tenantId, table.materialKey, table.specKey, table.color, table.finish), index("material_variants_tenant_idx").on(table.tenantId)]);

export const inventoryBalances = pgTable("inventory_balances", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull().references(() => organizations.id, { onDelete: "cascade" }), warehouseId: text("warehouse_id").notNull().references(() => warehouses.id, { onDelete: "cascade" }), materialId: text("material_id").notNull().references(() => materialVariants.id, { onDelete: "cascade" }),
  onHandQty: integer("on_hand_qty").notNull().default(0), reservedQty: integer("reserved_qty").notNull().default(0),
  revision: integer("revision").notNull().default(1), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex("inventory_balances_tenant_warehouse_material_unique").on(table.tenantId, table.warehouseId, table.materialId), check("inventory_balances_nonnegative", sql`${table.onHandQty} >= 0 and ${table.reservedQty} >= 0 and ${table.reservedQty} <= ${table.onHandQty}`)]);

export const stockDocuments = pgTable("stock_documents", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull().references(() => organizations.id, { onDelete: "cascade" }), code: text("code").notNull(), type: stockDocumentTypeEnum("type").notNull(), status: stockDocumentStatusEnum("status").notNull().default("draft"), warehouseId: text("warehouse_id").notNull().references(() => warehouses.id), targetWarehouseId: text("target_warehouse_id").references(() => warehouses.id), orderId: text("order_id").references(() => orders.id), sourceBatchId: text("source_batch_id"), note: text("note"), lines: jsonb("lines").$type<Array<Record<string, unknown>>>().notNull(), postedAt: timestamp("posted_at", { withTimezone: true }), postedByUserId: text("posted_by_user_id").references(() => users.id, { onDelete: "set null" }), revision: integer("revision").notNull().default(1), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex("stock_documents_tenant_code_unique").on(table.tenantId, table.code), uniqueIndex("stock_documents_tenant_source_batch_unique").on(table.tenantId, table.sourceBatchId), index("stock_documents_tenant_status_idx").on(table.tenantId, table.status)]);

export const inventoryLedger = pgTable("inventory_ledger", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull().references(() => organizations.id, { onDelete: "cascade" }), warehouseId: text("warehouse_id").notNull().references(() => warehouses.id), materialId: text("material_id").notNull().references(() => materialVariants.id), direction: inventoryLedgerDirectionEnum("direction").notNull(), quantity: integer("quantity").notNull(), deltaQty: integer("delta_qty").notNull(), referenceType: text("reference_type").notNull(), referenceId: text("reference_id"), note: text("note"), actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }), revision: integer("revision").notNull().default(1), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [index("inventory_ledger_tenant_created_idx").on(table.tenantId, table.createdAt), index("inventory_ledger_material_idx").on(table.tenantId, table.warehouseId, table.materialId)]);

export const inventoryReservations = pgTable("inventory_reservations", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull().references(() => organizations.id, { onDelete: "cascade" }), orderId: text("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }), warehouseId: text("warehouse_id").notNull().references(() => warehouses.id), materialId: text("material_id").notNull().references(() => materialVariants.id), qty: integer("qty").notNull(), issuedQty: integer("issued_qty").notNull().default(0), releasedQty: integer("released_qty").notNull().default(0), status: text("status").notNull().default("active"), revision: integer("revision").notNull().default(1), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [index("inventory_reservations_order_idx").on(table.tenantId, table.orderId), check("inventory_reservations_qty_positive", sql`${table.qty} > 0`)]);

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  memberships: many(members),
  invitations: many(invitations),
  ownedOrders: many(orders, { relationName: "orders_owner_user" }),
  assignedOrders: many(orders, { relationName: "orders_assigned_by_user" }),
  previousOrderAssignments: many(orderAssignments, { relationName: "order_assignments_previous_owner" }),
  orderAssignments: many(orderAssignments, { relationName: "order_assignments_owner" }),
  assignedOrderAssignments: many(orderAssignments, { relationName: "order_assignments_assigned_by" }),
  orderFollowUps: many(orderFollowUps)
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(members),
  invitations: many(invitations),
  customers: many(customers),
  projects: many(projects),
  templates: many(templates),
  designs: many(designs),
  quotes: many(quotes),
  orders: many(orders),
  orderAssignments: many(orderAssignments),
  orderFollowUps: many(orderFollowUps),
  dealers: many(dealerOrganizations),
  priceLists: many(priceLists),
  priceListItems: many(priceListItems),
  shipments: many(shipments),
  attachments: many(attachments)
}));

export const priceListsRelations = relations(priceLists, ({ many }) => ({
  items: many(priceListItems)
}));

export const priceListItemsRelations = relations(priceListItems, ({ one }) => ({
  priceList: one(priceLists, { fields: [priceListItems.priceListId], references: [priceLists.id] })
}));

export const membersRelations = relations(members, ({ one }) => ({
  organization: one(organizations, {
    fields: [members.organizationId],
    references: [organizations.id]
  }),
  user: one(users, { fields: [members.userId], references: [users.id] })
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  tenant: one(organizations, { fields: [projects.tenantId], references: [organizations.id] }),
  customer: one(customers, { fields: [projects.customerId], references: [customers.id] }),
  designs: many(designs),
  quotes: many(quotes),
  orders: many(orders)
}));

export const templatesRelations = relations(templates, ({ one, many }) => ({
  tenant: one(organizations, { fields: [templates.tenantId], references: [organizations.id] }),
  versions: many(templateVersions)
}));

export const designsRelations = relations(designs, ({ one, many }) => ({
  tenant: one(organizations, { fields: [designs.tenantId], references: [organizations.id] }),
  project: one(projects, { fields: [designs.projectId], references: [projects.id] }),
  templateVersion: one(templateVersions, {
    fields: [designs.templateVersionId],
    references: [templateVersions.id]
  }),
  versions: many(designVersions)
}));

export const quotesRelations = relations(quotes, ({ one, many }) => ({
  project: one(projects, { fields: [quotes.projectId], references: [projects.id] }),
  customer: one(customers, { fields: [quotes.customerId], references: [customers.id] }),
  designVersion: one(designVersions, {
    fields: [quotes.designVersionId],
    references: [designVersions.id]
  }),
  lines: many(quoteLines),
  order: one(orders)
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  project: one(projects, { fields: [orders.projectId], references: [projects.id] }),
  customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
  acceptedQuote: one(quotes, {
    fields: [orders.acceptedQuoteId],
    references: [quotes.id]
  }),
  owner: one(users, {
    relationName: "orders_owner_user",
    fields: [orders.ownerUserId],
    references: [users.id]
  }),
  assignedBy: one(users, {
    relationName: "orders_assigned_by_user",
    fields: [orders.assignedByUserId],
    references: [users.id]
  }),
  shipments: many(shipments),
  assignments: many(orderAssignments),
  followUps: many(orderFollowUps)
}));

export const orderAssignmentsRelations = relations(orderAssignments, ({ one }) => ({
  order: one(orders, { fields: [orderAssignments.orderId], references: [orders.id] }),
  previousOwner: one(users, {
    relationName: "order_assignments_previous_owner",
    fields: [orderAssignments.previousOwnerUserId],
    references: [users.id]
  }),
  owner: one(users, {
    relationName: "order_assignments_owner",
    fields: [orderAssignments.ownerUserId],
    references: [users.id]
  }),
  assignedBy: one(users, {
    relationName: "order_assignments_assigned_by",
    fields: [orderAssignments.assignedByUserId],
    references: [users.id]
  })
}));

export const orderFollowUpsRelations = relations(orderFollowUps, ({ one }) => ({
  order: one(orders, { fields: [orderFollowUps.orderId], references: [orders.id] }),
  author: one(users, { fields: [orderFollowUps.authorUserId], references: [users.id] })
}));

export const shipmentsRelations = relations(shipments, ({ one }) => ({
  order: one(orders, { fields: [shipments.orderId], references: [orders.id] })
}));

// Better Auth expects singular schema keys; application repositories use plurals.
export const user = users;
export const session = sessions;
export const account = accounts;
export const verification = verifications;
export const organization = organizations;
export const member = members;
export const invitation = invitations;
export const tenants = organizations;

export type User = typeof users.$inferSelect;
export type Tenant = typeof organizations.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Template = typeof templates.$inferSelect;
export type TemplateVersion = typeof templateVersions.$inferSelect;
export type Design = typeof designs.$inferSelect;
export type DesignVersion = typeof designVersions.$inferSelect;
export type Quote = typeof quotes.$inferSelect;
export type QuoteLine = typeof quoteLines.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderAssignment = typeof orderAssignments.$inferSelect;
export type OrderFollowUp = typeof orderFollowUps.$inferSelect;
export type DealerOrganization = typeof dealerOrganizations.$inferSelect;
export type PriceList = typeof priceLists.$inferSelect;
export type PriceListItem = typeof priceListItems.$inferSelect;
export type Shipment = typeof shipments.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type LoginLog = typeof loginLogs.$inferSelect;
export type IdempotencyKey = typeof idempotencyKeys.$inferSelect;
export type OrganizationEntitlement = typeof organizationEntitlements.$inferSelect;
export type MemberPermissionGrant = typeof memberPermissionGrants.$inferSelect;
export type MemberDataScope = typeof memberDataScopes.$inferSelect;
export type AuthorizationAuditLog = typeof authorizationAuditLogs.$inferSelect;
export type Warehouse = typeof warehouses.$inferSelect;
export type MaterialVariant = typeof materialVariants.$inferSelect;
export type InventoryBalance = typeof inventoryBalances.$inferSelect;
export type StockDocument = typeof stockDocuments.$inferSelect;
export type InventoryLedger = typeof inventoryLedger.$inferSelect;
export type InventoryReservation = typeof inventoryReservations.$inferSelect;
