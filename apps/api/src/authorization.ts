import type {
  AuthorizationSnapshot,
  DataScope,
  ErpModule,
  FieldPolicy,
  Permission,
  PermissionGrant,
  ResourceDataScope,
  Role
} from "@usm/contracts";

export const ERP_MODULES: ErpModule[] = [
  "configurator", "crm", "quotes", "orders", "fulfillment", "pricing",
  "warehouse", "reports", "accounts", "dealers", "audit"
];

export const ALL_PERMISSIONS: Permission[] = [
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
];

const moduleByPermission: Record<Permission, ErpModule> = {
  "configurator.use": "configurator", "templates.view": "configurator",
  "customers.view": "crm", "customers.create": "crm", "customers.update": "crm", "customers.delete": "crm", "customers.export": "crm",
  "projects.view": "crm", "projects.create": "crm", "projects.update": "crm", "projects.delete": "crm", "projects.transfer": "crm", "projects.export": "crm",
  "designs.view": "configurator", "designs.create": "configurator", "designs.update": "configurator", "designs.copy": "configurator", "designs.delete": "configurator", "designs.export": "configurator", "designs.bom.export": "configurator",
  "attachments.view": "configurator", "attachments.create": "configurator",
  "quotes.view": "quotes", "quotes.create": "quotes", "quotes.update": "quotes", "quotes.submit": "quotes", "quotes.approve": "quotes", "quotes.cancel": "quotes", "quotes.export": "quotes", "quotes.multiplier.view": "quotes", "quotes.multiplier.manage": "quotes",
  "orders.view": "orders", "orders.create": "orders", "orders.status.update": "orders", "orders.cancel": "orders", "orders.assign": "orders", "orders.follow_up": "orders", "orders.export": "orders",
  "fulfillment.production.view": "fulfillment", "fulfillment.production.update": "fulfillment", "fulfillment.shipments.view": "fulfillment", "fulfillment.shipments.create": "fulfillment", "fulfillment.logistics.update": "fulfillment",
  "prices.dealer.view": "pricing", "prices.retail.view": "pricing", "prices.master.view": "pricing", "prices.cost.view": "pricing", "prices.manage": "pricing",
  "inventory.availability.view": "warehouse", "inventory.quantity.view": "warehouse", "inventory.distribution.view": "warehouse", "inventory.value.view": "warehouse", "inventory.receive": "warehouse", "inventory.issue": "warehouse", "inventory.adjust": "warehouse", "inventory.transfer": "warehouse",
  "reports.personal.view": "reports", "reports.assigned.view": "reports", "reports.organization.view": "reports", "reports.financial.view": "reports", "reports.export": "reports",
  "account.manage": "accounts", "permission.delegate": "accounts", "dealer.manage": "dealers", "dealer.workspace.access": "dealers", "audit.view": "audit", "platform.entitlements.manage": "accounts"
};

const dealerAllowed = new Set<Permission>([
  "configurator.use", "templates.view",
  "customers.view", "customers.create", "customers.update", "customers.export",
  "projects.view", "projects.create", "projects.update", "projects.export",
  "designs.view", "designs.create", "designs.update", "designs.copy", "designs.export", "designs.bom.export", "attachments.view", "attachments.create",
  "quotes.view", "quotes.create", "quotes.update", "quotes.submit", "quotes.cancel", "quotes.export",
  "orders.view", "orders.create", "orders.follow_up",
  "fulfillment.shipments.view", "prices.dealer.view", "account.manage", "permission.delegate"
]);

export const DEALER_MODULES: ErpModule[] = [
  "configurator", "crm", "quotes", "orders", "fulfillment", "pricing", "accounts"
];

export function isPermissionAllowedForOrganization(permission: Permission, organizationType: "hq" | "dealer"): boolean {
  return organizationType !== "dealer" || dealerAllowed.has(permission);
}

function granted(...permissions: Permission[]): Permission[] { return permissions; }

export function legacyPermissionsForRole(role: Role, organizationType: "hq" | "dealer"): Permission[] {
  if (role === "owner" || role === "admin" || role === "headquarters_admin") return ALL_PERMISSIONS.filter((permission) =>
    permission !== "platform.entitlements.manage" && (organizationType !== "dealer" || dealerAllowed.has(permission))
  );
  if (role === "dealer_admin") return [...dealerAllowed];
  if (role === "dealer_designer_sales") return [...dealerAllowed].filter((permission) => !["account.manage", "permission.delegate"].includes(permission));
  if (role === "factory_employee") return granted("orders.view", "orders.status.update", "orders.follow_up", "fulfillment.production.view");
  if (role === "production" || role === "production_shipping") return granted("orders.view", "orders.status.update", "orders.follow_up", "fulfillment.production.view", "fulfillment.production.update", "fulfillment.shipments.view", "fulfillment.shipments.create", "fulfillment.logistics.update", "inventory.availability.view", "inventory.quantity.view", "inventory.issue");
  if (role === "finance") return granted("quotes.view", "quotes.create", "quotes.update", "quotes.submit", "quotes.export", "quotes.multiplier.view", "prices.retail.view", "prices.master.view", "prices.manage", "reports.personal.view", "reports.organization.view", "reports.export");
  if (role === "designer") return granted("configurator.use", "templates.view", "customers.view", "projects.view", "projects.create", "projects.update", "designs.view", "designs.create", "designs.update", "designs.copy", "designs.export", "designs.bom.export");
  if (role === "sales" || role === "headquarters_sales") return granted("configurator.use", "templates.view", "customers.view", "customers.create", "customers.update", "projects.view", "projects.create", "projects.update", "designs.view", "designs.create", "designs.update", "quotes.view", "quotes.create", "quotes.update", "quotes.submit", "quotes.multiplier.view", "quotes.multiplier.manage", "prices.retail.view", "orders.view", "orders.create", "orders.follow_up");
  if (role === "headquarters_reviewer") return granted("quotes.view", "quotes.approve", "orders.view");
  return granted("configurator.use", "templates.view", "customers.view", "projects.view", "designs.view", "quotes.view", "orders.view");
}

export function defaultEnabledModules(organizationType: "hq" | "dealer"): ErpModule[] {
  void organizationType;
  return [];
}

export function permissionModule(permission: Permission): ErpModule { return moduleByPermission[permission]; }

export function permissionScopeResource(permission: Permission): string {
  if (permission === "account.manage" || permission === "permission.delegate") return "accounts";
  if (permission === "dealer.manage" || permission === "dealer.workspace.access") return "dealers";
  if (permission.startsWith("fulfillment.")) return "orders";
  return permission.split(".")[0];
}

function defaultScopeForPermission(permission: Permission): DataScope {
  if (permission.startsWith("orders.") || permission.startsWith("projects.") || permission.startsWith("quotes.") || permission.startsWith("designs.")) return "organization";
  return "organization";
}

export function buildFieldPolicy(permissions: Permission[], organizationType: "hq" | "dealer"): FieldPolicy {
  const has = (permission: Permission) => permissions.includes(permission);
  const price: FieldPolicy["price"] = organizationType === "dealer" && has("prices.dealer.view")
    ? "dealer_only"
    : has("prices.cost.view") ? "cost"
      : has("prices.master.view") ? "master"
        : has("prices.retail.view") ? "retail"
          : has("prices.dealer.view") ? "dealer_only" : "none";
  const inventory: FieldPolicy["inventory"] = has("inventory.value.view") ? "value"
    : has("inventory.distribution.view") ? "distribution"
      : has("inventory.quantity.view") ? "quantity"
        : has("inventory.availability.view") ? "availability" : "none";
  return { price, inventory };
}

export function calculateAuthorization(input: {
  role: Role;
  organizationType: "hq" | "dealer";
  grants?: PermissionGrant[];
  dataScopes?: ResourceDataScope[];
  entitlements?: Array<{ module: ErpModule; enabled: boolean; permissionAllowlist: Permission[] | null }>;
}): AuthorizationSnapshot {
  const entitlements = input.entitlements ?? [];
  const configuredEntitlements = new Map(entitlements.map((entitlement) => [entitlement.module, entitlement]));
  const enabledModules = ERP_MODULES.filter((module) =>
    configuredEntitlements.get(module)?.enabled === true
    && (input.organizationType !== "dealer" || DEALER_MODULES.includes(module))
  );
  // An explicitly persisted empty grant list means deny-all; only undefined triggers legacy migration.
  const raw = input.grants !== undefined ? input.grants.map((grant) => grant.permission) : legacyPermissionsForRole(input.role, input.organizationType);
  const effectivePermissions = [...new Set(raw)]
    .filter((permission): permission is Permission => permission === "platform.entitlements.manage" || enabledModules.includes(permissionModule(permission)))
    .filter((permission) => {
      const entitlement = configuredEntitlements.get(permissionModule(permission));
      return permission === "platform.entitlements.manage" || !entitlement?.permissionAllowlist || entitlement.permissionAllowlist.includes(permission);
    })
    .filter((permission) => input.organizationType !== "dealer" || dealerAllowed.has(permission));
  const scopesByPermission = new Map((input.grants ?? []).map((grant) => [grant.permission, grant]));
  const dataScopes: Record<string, ResourceDataScope> = {};
  const scopeRank: Record<DataScope, number> = { own: 0, assigned: 1, specified: 2, organization: 3 };
  for (const permission of effectivePermissions) {
    const grant = scopesByPermission.get(permission);
    if (!grant) continue;
     const resource = permissionScopeResource(permission);
    const current = dataScopes[resource];
    const candidate = { resource, scope: grant.scope, assignedUserIds: grant.assignedUserIds };
    if (!current || scopeRank[candidate.scope] < scopeRank[current.scope]) dataScopes[resource] = candidate;
  }
  for (const scope of input.dataScopes ?? []) dataScopes[scope.resource] = scope;
  if (input.grants === undefined && input.role === "factory_employee") {
    dataScopes.orders = { resource: "orders", scope: "assigned", assignedUserIds: [] };
    dataScopes.followUps = { resource: "followUps", scope: "own", assignedUserIds: [] };
  }
  const canDelegate = effectivePermissions.includes("permission.delegate");
  return {
    enabledModules,
    effectivePermissions,
    delegablePermissions: canDelegate ? effectivePermissions.filter((permission) => permission !== "platform.entitlements.manage") : [],
    dataScopes,
    fieldPolicy: buildFieldPolicy(effectivePermissions, input.organizationType)
  };
}

export function platformAuthorization(): AuthorizationSnapshot {
  const dataScopes: Record<string, ResourceDataScope> = {};
  for (const permission of ALL_PERMISSIONS) {
    const resource = permissionScopeResource(permission);
    dataScopes[resource] ??= { resource, scope: "organization", assignedUserIds: [] };
  }
  return {
    enabledModules: [...ERP_MODULES],
    effectivePermissions: [...ALL_PERMISSIONS],
    delegablePermissions: ALL_PERMISSIONS.filter((permission) => permission !== "platform.entitlements.manage"),
    dataScopes,
    fieldPolicy: buildFieldPolicy(ALL_PERMISSIONS, "hq")
  };
}

export function hasPermission(authorization: AuthorizationSnapshot, permission: Permission): boolean {
  return authorization.effectivePermissions.includes(permission);
}

export function getScope(authorization: AuthorizationSnapshot, resource: string, fallback: DataScope = "organization"): ResourceDataScope {
  return authorization.dataScopes[resource]
    ?? Object.values(authorization.dataScopes).find((scope) => scope.resource === resource)
    ?? { resource, scope: fallback, assignedUserIds: [] };
}

const DATA_SCOPE_RANK: Record<DataScope, number> = { own: 0, assigned: 1, specified: 2, organization: 3 };

/**
 * Delegation may only preserve or narrow the actor's effective data boundary.
 * `specified` scopes are additionally restricted to the actor's allow-list.
 */
export function dataScopeAllowsDelegation(
  actorAuthorization: AuthorizationSnapshot,
  resource: string,
  requested: ResourceDataScope
): boolean {
  const actorScope = getScope(actorAuthorization, resource);
  if (actorScope.scope === "organization") return true;
  if (DATA_SCOPE_RANK[requested.scope] > DATA_SCOPE_RANK[actorScope.scope]) return false;
  if (actorScope.scope === "own") return requested.scope === "own";
  if (actorScope.scope === "assigned") return requested.scope === "own" || requested.scope === "assigned";
  if (requested.scope !== "specified") return true;
  const allowed = new Set(actorScope.assignedUserIds);
  return requested.assignedUserIds.every((userId) => allowed.has(userId));
}

export function scopeAllowsUser(scope: ResourceDataScope, actorUserId: string, ownerUserId: string | null | undefined): boolean {
  if (scope.scope === "organization") return true;
  if (scope.scope === "own" || scope.scope === "assigned") return ownerUserId === actorUserId;
  return ownerUserId === actorUserId || scope.assignedUserIds.includes(ownerUserId ?? "");
}

export function scopeAllowsRecord(
  scope: ResourceDataScope,
  actorUserId: string,
  record: { createdByUserId?: string | null; assignedUserId?: string | null }
): boolean {
  if (scope.scope === "organization") return true;
  if (scope.scope === "own") return record.createdByUserId === actorUserId;
  if (scope.scope === "assigned") return record.assignedUserId === actorUserId;
  if (record.createdByUserId === actorUserId || record.assignedUserId === actorUserId) return true;
  return scope.assignedUserIds.includes(record.createdByUserId ?? "") || scope.assignedUserIds.includes(record.assignedUserId ?? "");
}
