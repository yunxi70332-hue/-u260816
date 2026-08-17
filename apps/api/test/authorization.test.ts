import assert from "node:assert/strict";
import test from "node:test";
import type { PermissionGrant, ResourceDataScope } from "@usm/contracts";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { MemoryRepository } from "../src/memory-repository.js";
import {
  calculateAuthorization,
  dataScopeAllowsDelegation,
  getScope,
  hasPermission,
  platformAuthorization,
  scopeAllowsRecord,
  scopeAllowsUser
} from "../src/authorization.js";

test("disabled organization modules immediately remove effective permissions", () => {
  const authorization = calculateAuthorization({
    role: "owner",
    organizationType: "hq",
    grants: [
      { permission: "orders.view", scope: "organization", assignedUserIds: [] },
      { permission: "inventory.quantity.view", scope: "organization", assignedUserIds: [] },
      { permission: "permission.delegate", scope: "organization", assignedUserIds: [] }
    ] satisfies PermissionGrant[],
    entitlements: [
      { module: "orders", enabled: true, permissionAllowlist: null },
      { module: "warehouse", enabled: false, permissionAllowlist: null },
      { module: "accounts", enabled: true, permissionAllowlist: null }
    ]
  });

  assert.equal(authorization.enabledModules.includes("orders"), true);
  assert.equal(authorization.enabledModules.includes("warehouse"), false);
  assert.equal(hasPermission(authorization, "orders.view"), true);
  assert.equal(hasPermission(authorization, "inventory.quantity.view"), false);
  assert.equal(authorization.fieldPolicy.inventory, "none");
  assert.equal(authorization.delegablePermissions.includes("orders.view"), true);
  assert.equal(authorization.delegablePermissions.includes("inventory.quantity.view"), false);
});

test("permission allowlists and grants are intersected before delegation", () => {
  const authorization = calculateAuthorization({
    role: "owner",
    organizationType: "hq",
    grants: [
      { permission: "prices.cost.view", scope: "organization", assignedUserIds: [] },
      { permission: "prices.dealer.view", scope: "organization", assignedUserIds: [] },
      { permission: "permission.delegate", scope: "organization", assignedUserIds: [] }
    ],
    entitlements: [
      { module: "pricing", enabled: true, permissionAllowlist: ["prices.dealer.view"] },
      { module: "accounts", enabled: true, permissionAllowlist: ["permission.delegate"] }
    ]
  });

  assert.equal(hasPermission(authorization, "prices.dealer.view"), true);
  assert.equal(hasPermission(authorization, "prices.cost.view"), false);
  assert.deepEqual(authorization.delegablePermissions, ["prices.dealer.view", "permission.delegate"]);
  assert.equal(authorization.fieldPolicy.price, "dealer_only");
});

test("dealer authorization cannot escape dealer policy or expose sensitive price and inventory fields", () => {
  const authorization = calculateAuthorization({
    role: "dealer_admin",
    organizationType: "dealer",
    grants: [
      { permission: "prices.dealer.view", scope: "organization", assignedUserIds: [] },
      { permission: "prices.retail.view", scope: "organization", assignedUserIds: [] },
      { permission: "prices.cost.view", scope: "organization", assignedUserIds: [] },
      { permission: "inventory.quantity.view", scope: "organization", assignedUserIds: [] },
      { permission: "orders.view", scope: "organization", assignedUserIds: [] }
    ],
    entitlements: [
      { module: "pricing", enabled: true, permissionAllowlist: null },
      { module: "warehouse", enabled: true, permissionAllowlist: null },
      { module: "orders", enabled: true, permissionAllowlist: null }
    ]
  });

  assert.equal(hasPermission(authorization, "prices.dealer.view"), true);
  assert.equal(hasPermission(authorization, "prices.retail.view"), false);
  assert.equal(hasPermission(authorization, "prices.cost.view"), false);
  assert.equal(hasPermission(authorization, "inventory.quantity.view"), false);
  assert.equal(authorization.fieldPolicy.price, "dealer_only");
  assert.equal(authorization.fieldPolicy.inventory, "none");
  assert.equal(authorization.enabledModules.includes("warehouse"), false);
});

test("data scopes distinguish own, assigned, specified, and organization resources", () => {
  const scopes: ResourceDataScope[] = [
    { resource: "own-records", scope: "own", assignedUserIds: [] },
    { resource: "assigned-records", scope: "assigned", assignedUserIds: [] },
    { resource: "specified-records", scope: "specified", assignedUserIds: ["user-b"] },
    { resource: "organization-records", scope: "organization", assignedUserIds: [] }
  ];
  const authorization = calculateAuthorization({ role: "member", organizationType: "hq", dataScopes: scopes });

  assert.deepEqual(getScope(authorization, "own-records"), scopes[0]);
  assert.equal(scopeAllowsUser(scopes[0], "user-a", "user-a"), true);
  assert.equal(scopeAllowsUser(scopes[0], "user-a", "user-b"), false);
  assert.equal(scopeAllowsUser(scopes[1], "user-a", "user-a"), true);
  assert.equal(scopeAllowsUser(scopes[1], "user-a", "user-b"), false);
  assert.equal(scopeAllowsUser(scopes[2], "user-a", "user-b"), true);
  assert.equal(scopeAllowsUser(scopes[2], "user-a", "user-c"), false);
  assert.equal(scopeAllowsUser(scopes[3], "user-a", "user-c"), true);
  const transferredRecord = { createdByUserId: "user-a", assignedUserId: "user-b" };
  assert.equal(scopeAllowsRecord(scopes[0], "user-a", transferredRecord), true);
  assert.equal(scopeAllowsRecord(scopes[0], "user-b", transferredRecord), false);
  assert.equal(scopeAllowsRecord(scopes[1], "user-a", transferredRecord), false);
  assert.equal(scopeAllowsRecord(scopes[1], "user-b", transferredRecord), true);
  assert.equal(scopeAllowsRecord(scopes[2], "user-a", transferredRecord), true);
  assert.equal(scopeAllowsRecord(scopes[2], "user-c", { createdByUserId: "user-b", assignedUserId: null }), true);
  assert.equal(scopeAllowsRecord(scopes[2], "user-c", { createdByUserId: null, assignedUserId: "user-b" }), true);
  assert.equal(scopeAllowsRecord(scopes[2], "user-c", transferredRecord), true);
  assert.equal(scopeAllowsRecord(scopes[2], "user-c", { createdByUserId: "user-d", assignedUserId: null }), false);
});

test("delegation cannot widen an actor's data scope", () => {
  const actor = calculateAuthorization({
    role: "member",
    organizationType: "hq",
    grants: [{ permission: "projects.view", scope: "specified", assignedUserIds: ["user-b"] }],
    entitlements: [{ module: "crm", enabled: true, permissionAllowlist: null }]
  });

  assert.equal(dataScopeAllowsDelegation(actor, "projects", { resource: "projects", scope: "specified", assignedUserIds: ["user-b"] }), true);
  assert.equal(dataScopeAllowsDelegation(actor, "projects", { resource: "projects", scope: "specified", assignedUserIds: ["user-c"] }), false);
  assert.equal(dataScopeAllowsDelegation(actor, "projects", { resource: "projects", scope: "organization", assignedUserIds: [] }), false);
});

test("missing organization entitlements deny all enterprise business permissions", () => {
  const authorization = calculateAuthorization({
    role: "owner",
    organizationType: "hq",
    grants: [
      { permission: "orders.view", scope: "organization", assignedUserIds: [] },
      { permission: "inventory.quantity.view", scope: "organization", assignedUserIds: [] },
      { permission: "reports.organization.view", scope: "organization", assignedUserIds: [] }
    ]
  });

  assert.deepEqual(authorization.enabledModules, []);
  assert.deepEqual(authorization.effectivePermissions, []);
  assert.equal(authorization.fieldPolicy.inventory, "none");
});

test("platform authorization retains every permission regardless of organization entitlements", () => {
  const authorization = platformAuthorization();

  assert.equal(authorization.enabledModules.length > 0, true);
  assert.equal(hasPermission(authorization, "platform.entitlements.manage"), true);
  assert.equal(hasPermission(authorization, "inventory.quantity.view"), true);
  assert.equal(hasPermission(authorization, "orders.view"), true);
});

test("an organization owner cannot delegate platform-only authority", async () => {
  const repository = new MemoryRepository();

  await assert.rejects(
    repository.updateAccountAuthorization(
      "tenant-demo",
      "membership-demo",
      {
        grants: [{ permission: "platform.entitlements.manage", scope: "organization", assignedUserIds: [] }],
        dataScopes: []
      },
      "user-demo"
    ),
    (error: unknown) => {
      assert.equal((error as { statusCode?: number }).statusCode, 403);
      return true;
    }
  );
});

test("platform operations can create an enterprise admin without delegating platform authorization", async (context) => {
  const repository = new MemoryRepository();
  const app = await buildApp(
    { ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" },
    { repository }
  );
  context.after(() => app.close());

  const created = await app.inject({
    method: "POST",
    url: "/api/organization/admins",
    headers: { "idempotency-key": "create-enterprise-admin" },
    payload: {
      name: "Enterprise Administrator",
      phone: "13800000987",
      email: "enterprise-admin@example.test",
      password: "EntAdm123!"
    }
  });
  assert.equal(created.statusCode, 201);

  const account = (JSON.parse(created.body) as { item: { id: string; role: string } }).item;
  assert.equal(account.role, "headquarters_admin");

  const accountAuthorization = await repository.getAccountAuthorization("tenant-demo", account.id);
  assert.ok(accountAuthorization);
  assert.equal(accountAuthorization.effectivePermissions.includes("account.manage"), true);
  assert.equal(accountAuthorization.effectivePermissions.includes("permission.delegate"), true);
  assert.equal(accountAuthorization.effectivePermissions.includes("platform.entitlements.manage"), false);

  const signIn = await app.inject({
    method: "POST",
    url: "/api/auth/sign-in/phone-number",
    payload: { phoneNumber: "+8613800000987", password: "EntAdm123!" }
  });
  assert.equal(signIn.statusCode, 200);
  const cookieHeader = signIn.headers["set-cookie"];
  assert.ok(cookieHeader);
  const headers = { cookie: Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader };

  const session = await app.inject({ method: "GET", url: "/api/session", headers });
  assert.equal(session.statusCode, 200);
  const sessionBody = JSON.parse(session.body) as { effectivePermissions: string[]; mustChangePassword: boolean };
  assert.equal(sessionBody.mustChangePassword, true);
  const changed = await app.inject({
    method: "POST",
    url: "/api/me/change-password",
    headers,
    payload: { currentPassword: "EntAdm123!", newPassword: "Changed6!" }
  });
  assert.equal(changed.statusCode, 200);
  const activeSession = await app.inject({ method: "GET", url: "/api/session", headers });
  const activeSessionBody = JSON.parse(activeSession.body) as { effectivePermissions: string[]; mustChangePassword: boolean };
  assert.equal(activeSessionBody.mustChangePassword, false);
  assert.equal(activeSessionBody.effectivePermissions.includes("platform.entitlements.manage"), false);
  assert.equal((await app.inject({ method: "GET", url: "/api/organization/entitlements", headers })).statusCode, 403);
  assert.equal((await app.inject({
    method: "POST",
    url: "/api/organization/admins",
    headers: { ...headers, "idempotency-key": "enterprise-admin-cannot-create-peer" },
    payload: { name: "Blocked", phone: "13800000986", password: "Block123!" }
  })).statusCode, 403);
});

test("disabling warehouse entitlement preserves grants but removes warehouse access", async () => {
  const repository = new MemoryRepository();
  const entitlements = await repository.listOrganizationEntitlements("tenant-demo");
  const updated = await repository.updateOrganizationEntitlements(
    "tenant-demo",
    { entitlements: entitlements.map((item) => item.module === "warehouse" ? { ...item, enabled: false } : item) },
    "user-demo"
  );
  assert.equal(updated.find((item) => item.module === "warehouse")?.enabled, false);

  const authorization = calculateAuthorization({
    role: "owner",
    organizationType: "hq",
    grants: [
      { permission: "inventory.quantity.view", scope: "organization", assignedUserIds: [] },
      { permission: "orders.view", scope: "organization", assignedUserIds: [] }
    ],
    entitlements: updated
  });
  assert.equal(authorization.enabledModules.includes("warehouse"), false);
  assert.equal(authorization.effectivePermissions.includes("inventory.quantity.view"), false);
});

test("disabling a tenant warehouse entitlement does not reduce platform administrator access", async (context) => {
  const repository = new MemoryRepository();
  const app = await buildApp(
    { ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" },
    { repository }
  );
  context.after(() => app.close());

  const entitlements = await repository.listOrganizationEntitlements("tenant-demo");
  const updated = await app.inject({
    method: "PUT",
    url: "/api/organization/entitlements",
    payload: {
      entitlements: entitlements.map((item) => item.module === "warehouse" ? { ...item, enabled: false } : item)
    }
  });
  assert.equal(updated.statusCode, 200);

  const session = await app.inject({ method: "GET", url: "/api/session" });
  const sessionBody = JSON.parse(session.body) as { enabledModules: string[]; effectivePermissions: string[] };
  assert.equal(sessionBody.enabledModules.includes("warehouse"), true);
  assert.equal(sessionBody.effectivePermissions.some((permission) => permission.startsWith("inventory.")), true);

  for (const url of ["/api/inventory/balances", "/api/inventory/ledger", "/api/warehouses"]) {
    assert.equal((await app.inject({ method: "GET", url })).statusCode, 200, `${url} was unexpectedly blocked`);
  }
});

test("unchanged grants from a disabled module survive unrelated authorization edits", async (context) => {
  const repository = new MemoryRepository();
  const app = await buildApp(
    { ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" },
    { repository }
  );
  context.after(() => app.close());

  const created = await app.inject({
    method: "POST",
    url: "/api/employees",
    headers: { "idempotency-key": "disabled-module-grant-target" },
    payload: { name: "Disabled Module Target", phone: "13800000896", password: "Module123!" }
  });
  assert.equal(created.statusCode, 201);
  const accountId = (JSON.parse(created.body) as { item: { id: string } }).item.id;

  const initial = await app.inject({
    method: "PUT",
    url: `/api/accounts/${accountId}/authorization`,
    payload: {
      grants: [
        { permission: "inventory.quantity.view", scope: "organization", assignedUserIds: [] },
        { permission: "orders.view", scope: "organization", assignedUserIds: [] }
      ],
      dataScopes: []
    }
  });
  assert.equal(initial.statusCode, 200);

  const entitlements = await repository.listOrganizationEntitlements("tenant-demo");
  const disabled = await app.inject({
    method: "PUT",
    url: "/api/organization/entitlements",
    payload: { entitlements: entitlements.map((item) => item.module === "warehouse" ? { ...item, enabled: false } : item) }
  });
  assert.equal(disabled.statusCode, 200);

  const edited = await app.inject({
    method: "PUT",
    url: `/api/accounts/${accountId}/authorization`,
    payload: {
      grants: [
        { permission: "inventory.quantity.view", scope: "organization", assignedUserIds: [] },
        { permission: "orders.view", scope: "organization", assignedUserIds: [] },
        { permission: "orders.follow_up", scope: "organization", assignedUserIds: [] }
      ],
      dataScopes: []
    }
  });
  assert.equal(edited.statusCode, 200);
  const authorization = (JSON.parse(edited.body) as { item: { grants: Array<{ permission: string }>; effectivePermissions: string[] } }).item;
  assert.ok(authorization.grants.some((grant) => grant.permission === "inventory.quantity.view"));
  assert.equal(authorization.effectivePermissions.includes("inventory.quantity.view"), false);
  assert.equal(authorization.effectivePermissions.includes("orders.follow_up"), true);
});

test("assigned report permission only exposes explicitly selected accounts", async (context) => {
  const repository = new MemoryRepository();
  const app = await buildApp(
    { ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" },
    { repository }
  );
  context.after(() => app.close());

  const createEmployee = async (name: string, phone: string, password: string) => {
    const response = await app.inject({
      method: "POST",
      url: "/api/employees",
      headers: { "idempotency-key": `report-scope-${phone}` },
      payload: { name, phone, password }
    });
    assert.equal(response.statusCode, 201);
    return (JSON.parse(response.body) as { item: { id: string; userId: string } }).item;
  };

  const viewer = await createEmployee("Report Viewer", "13800000881", "Report123!");
  const allowed = await createEmployee("Allowed Report", "13800000882", "Allow123!");
  const denied = await createEmployee("Denied Report", "13800000883", "Deny123!");

  const authorization = await app.inject({
    method: "PUT",
    url: `/api/accounts/${viewer.id}/authorization`,
    payload: {
      grants: [{ permission: "reports.assigned.view", scope: "specified", assignedUserIds: [allowed.userId] }],
      dataScopes: [{ resource: "reports", scope: "specified", assignedUserIds: [allowed.userId] }]
    }
  });
  assert.equal(authorization.statusCode, 200);

  const signIn = await app.inject({
    method: "POST",
    url: "/api/auth/sign-in/phone-number",
    payload: { phoneNumber: "+8613800000881", password: "Report123!" }
  });
  assert.equal(signIn.statusCode, 200);
  const cookieHeader = signIn.headers["set-cookie"];
  assert.ok(cookieHeader);
  const headers = { cookie: Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader };
  const changed = await app.inject({
    method: "POST",
    url: "/api/me/change-password",
    headers,
    payload: { currentPassword: "Report123!", newPassword: "Changed6!" }
  });
  assert.equal(changed.statusCode, 200);

  const scopedSummary = await app.inject({ method: "GET", url: "/api/employees/order-summary", headers });
  assert.equal(scopedSummary.statusCode, 200);
  assert.deepEqual(
    (JSON.parse(scopedSummary.body) as { items: Array<{ employee: { userId: string } }> }).items
      .map((item) => item.employee.userId)
      .sort(),
    [viewer.userId, allowed.userId].sort()
  );
  assert.equal((await app.inject({ method: "GET", url: `/api/employees/order-summary?employeeId=${allowed.userId}`, headers })).statusCode, 200);
  assert.equal((await app.inject({ method: "GET", url: `/api/employees/order-summary?employeeId=${denied.userId}`, headers })).statusCode, 404);

  const organizationSummary = await app.inject({ method: "GET", url: "/api/employees/order-summary" });
  assert.equal(organizationSummary.statusCode, 200);
  assert.deepEqual(
    new Set((JSON.parse(organizationSummary.body) as { items: Array<{ employee: { userId: string } }> }).items.map((item) => item.employee.userId)),
    new Set([viewer.userId, allowed.userId, denied.userId])
  );
});

test("authorization preview is non-persistent and copy applies the source account grants", async (context) => {
  const repository = new MemoryRepository();
  const app = await buildApp(
    { ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" },
    { repository }
  );
  context.after(() => app.close());

  const createEmployee = async (name: string, phone: string) => {
    const response = await app.inject({
      method: "POST",
      url: "/api/employees",
      headers: { "idempotency-key": `authorization-copy-${phone}` },
      payload: { name, phone, password: "Copy123!" }
    });
    assert.equal(response.statusCode, 201);
    return (JSON.parse(response.body) as { item: { id: string } }).item;
  };
  const source = await createEmployee("Authorization Source", "13800000891");
  const target = await createEmployee("Authorization Target", "13800000892");
  const sourceInput = {
    grants: [
      { permission: "orders.view", scope: "assigned", assignedUserIds: [] },
      { permission: "orders.follow_up", scope: "assigned", assignedUserIds: [] }
    ],
    dataScopes: [{ resource: "orders", scope: "assigned", assignedUserIds: [] }]
  } as const;
  assert.equal((await app.inject({
    method: "PUT",
    url: `/api/accounts/${source.id}/authorization`,
    payload: sourceInput
  })).statusCode, 200);

  const preview = await app.inject({
    method: "POST",
    url: `/api/accounts/${target.id}/authorization/preview`,
    payload: {
      grants: [{ permission: "quotes.view", scope: "own", assignedUserIds: [] }],
      dataScopes: [{ resource: "quotes", scope: "own", assignedUserIds: [] }]
    }
  });
  assert.equal(preview.statusCode, 200);
  assert.equal((JSON.parse(preview.body) as { item: { effectivePermissions: string[] } }).item.effectivePermissions.includes("quotes.view"), true);
  const unchanged = await app.inject({ method: "GET", url: `/api/accounts/${target.id}/authorization` });
  assert.deepEqual((JSON.parse(unchanged.body) as { item: { grants: unknown[] } }).item.grants, []);

  const copied = await app.inject({
    method: "POST",
    url: `/api/accounts/${target.id}/authorization/copy`,
    payload: { sourceAccountId: source.id }
  });
  assert.equal(copied.statusCode, 200);
  assert.deepEqual(
    (JSON.parse(copied.body) as { item: { grants: unknown[] } }).item.grants,
    sourceInput.grants
  );
  const persisted = await app.inject({ method: "GET", url: `/api/accounts/${target.id}/authorization` });
  assert.deepEqual(
    (JSON.parse(persisted.body) as { item: { grants: unknown[] } }).item.grants,
    sourceInput.grants
  );
});

test("account-scoped permission delegation cannot read or copy outside its account scope", async (context) => {
  const repository = new MemoryRepository();
  const app = await buildApp(
    { ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" },
    { repository }
  );
  context.after(() => app.close());

  const createEmployee = async (name: string, phone: string, password: string) => {
    const response = await app.inject({
      method: "POST",
      url: "/api/employees",
      headers: { "idempotency-key": `account-scope-${phone}` },
      payload: { name, phone, password }
    });
    assert.equal(response.statusCode, 201);
    return (JSON.parse(response.body) as { item: { id: string; userId: string } }).item;
  };

  const actor = await createEmployee("Scoped Delegate", "13800000893", "Scope123!");
  const allowed = await createEmployee("Allowed Account", "13800000894", "AllowAcct!");
  const denied = await createEmployee("Denied Account", "13800000895", "DenyAcct!");

  for (const account of [allowed, denied]) {
    const response = await app.inject({
      method: "PUT",
      url: `/api/accounts/${account.id}/authorization`,
      payload: { grants: [], dataScopes: [] }
    });
    assert.equal(response.statusCode, 200);
  }
  const actorAuthorization = await app.inject({
    method: "PUT",
    url: `/api/accounts/${actor.id}/authorization`,
    payload: {
      grants: [{ permission: "permission.delegate", scope: "specified", assignedUserIds: [allowed.userId] }],
      dataScopes: []
    }
  });
  assert.equal(actorAuthorization.statusCode, 200);

  const signIn = await app.inject({
    method: "POST",
    url: "/api/auth/sign-in/phone-number",
    payload: { phoneNumber: "+8613800000893", password: "Scope123!" }
  });
  assert.equal(signIn.statusCode, 200);
  const cookieHeader = signIn.headers["set-cookie"];
  assert.ok(cookieHeader);
  const headers = { cookie: Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader };
  const changed = await app.inject({
    method: "POST",
    url: "/api/me/change-password",
    headers,
    payload: { currentPassword: "Scope123!", newPassword: "Changed6!" }
  });
  assert.equal(changed.statusCode, 200);

  const accountList = await app.inject({ method: "GET", url: "/api/accounts", headers });
  assert.equal(accountList.statusCode, 200);
  const visibleAccountIds = (JSON.parse(accountList.body) as { items: Array<{ id: string }> }).items.map((account) => account.id);
  assert.ok(visibleAccountIds.includes(actor.id));
  assert.ok(visibleAccountIds.includes(allowed.id));
  assert.ok(!visibleAccountIds.includes(denied.id));
  assert.equal((await app.inject({ method: "GET", url: `/api/accounts/${allowed.id}/authorization`, headers })).statusCode, 200);
  assert.equal((await app.inject({ method: "GET", url: `/api/accounts/${denied.id}/authorization`, headers })).statusCode, 404);
  assert.equal((await app.inject({ method: "GET", url: `/api/accounts/${denied.id}/authorization/preview`, headers })).statusCode, 404);
  assert.equal((await app.inject({
    method: "POST",
    url: `/api/accounts/${denied.id}/authorization/preview`,
    headers,
    payload: { grants: [], dataScopes: [] }
  })).statusCode, 404);
  assert.equal((await app.inject({
    method: "PUT",
    url: `/api/accounts/${denied.id}/authorization`,
    headers,
    payload: { grants: [], dataScopes: [] }
  })).statusCode, 404);
  assert.equal((await app.inject({
    method: "POST",
    url: `/api/accounts/${denied.id}/authorization/copy`,
    headers,
    payload: { sourceAccountId: allowed.id }
  })).statusCode, 404);
  assert.equal((await app.inject({
    method: "POST",
    url: `/api/accounts/${actor.id}/authorization/copy`,
    headers,
    payload: { sourceAccountId: denied.id }
  })).statusCode, 404);
});

test("attachment lists inherit the parent resource data scope", async (context) => {
  const repository = new MemoryRepository();
  const app = await buildApp(
    { ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" },
    { repository }
  );
  context.after(() => app.close());

  const createdAttachment = await app.inject({
    method: "POST",
    url: "/api/attachments",
    headers: { "idempotency-key": "scoped-attachment-seed" },
    payload: {
      entityType: "order",
      entityId: "order-demo",
      fileName: "factory-only.pdf",
      contentType: "application/pdf",
      sizeBytes: 128,
      metadata: {}
    }
  });
  assert.equal(createdAttachment.statusCode, 201);

  const employee = await app.inject({
    method: "POST",
    url: "/api/employees",
    headers: { "idempotency-key": "scoped-attachment-employee" },
    payload: { name: "Scoped Attachment User", phone: "13800000992", password: "Attach123!" }
  });
  assert.equal(employee.statusCode, 201);
  const accountId = (JSON.parse(employee.body) as { item: { id: string } }).item.id;

  const authorization = await app.inject({
    method: "PUT",
    url: `/api/accounts/${accountId}/authorization`,
    payload: {
      grants: [
        { permission: "orders.view", scope: "own", assignedUserIds: [] },
        { permission: "attachments.view", scope: "own", assignedUserIds: [] }
      ],
      dataScopes: [
        { resource: "orders", scope: "own", assignedUserIds: [] }
      ]
    }
  });
  assert.equal(authorization.statusCode, 200);

  const signIn = await app.inject({
    method: "POST",
    url: "/api/auth/sign-in/phone-number",
    payload: { phoneNumber: "+8613800000992", password: "Attach123!" }
  });
  assert.equal(signIn.statusCode, 200);
  const cookieHeader = signIn.headers["set-cookie"];
  assert.ok(cookieHeader);
  const headers = { cookie: Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader };
  const changed = await app.inject({
    method: "POST",
    url: "/api/me/change-password",
    headers,
    payload: { currentPassword: "Attach123!", newPassword: "Changed6!" }
  });
  assert.equal(changed.statusCode, 200);

  for (const url of ["/api/attachments", "/api/attachments?entityType=order"]) {
    const response = await app.inject({ method: "GET", url, headers });
    assert.equal(response.statusCode, 200);
    assert.deepEqual((JSON.parse(response.body) as { items: unknown[] }).items, []);
  }
  assert.equal((await app.inject({ method: "GET", url: "/api/attachments?orderId=order-demo", headers })).statusCode, 404);
});
