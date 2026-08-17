import assert from "node:assert/strict";
import test from "node:test";
import type { IncomingHttpHeaders } from "node:http";
import { buildApp } from "../src/app.js";
import type { AuthIdentity, AuthService } from "../src/auth.js";
import { loadConfig } from "../src/config.js";

function body<T>(response: { body: string }): T {
  return JSON.parse(response.body) as T;
}

function testIdentity(headers: IncomingHttpHeaders): string {
  const value = headers["x-test-user"];
  return Array.isArray(value) ? value[0] ?? "user-demo" : value ?? "user-demo";
}

function createTestAuth(): AuthService {
  const identities = new Map<string, AuthIdentity>([
    ["user-demo", {
      user: { id: "user-demo", name: "System Administrator", email: "admin@local.usm" },
      activeTenantId: "tenant-demo"
    }]
  ]);
  let employeeSequence = 0;

  return {
    mode: "development",
    async handle() {
      throw new Error("Test auth does not expose auth routes");
    },
    async getIdentity(headers) {
      return identities.get(testIdentity(headers)) ?? null;
    },
    async changePassword() {
      return { headers: new Headers(), response: { status: true } };
    },
    async createEmployee(input) {
      employeeSequence += 1;
      const userId = `employee-test-${employeeSequence}`;
      identities.set(userId, {
        user: { id: userId, name: input.name, email: input.email },
        activeTenantId: input.organizationId
      });
      return { userId };
    }
  };
}

test("factory employees are isolated to their assigned orders and retain follow-up authorship", async (context) => {
  const app = await buildApp(
    { ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" },
    { auth: createTestAuth() }
  );
  context.after(() => app.close());

  const adminHeaders = { "x-test-user": "user-demo" };
  const createEmployee = async (name: string, phone: string, key: string) => {
    const response = await app.inject({
      method: "POST",
      url: "/api/employees",
      headers: { ...adminHeaders, "idempotency-key": key },
      payload: { name, phone, password: "Test123!" }
    });
    assert.equal(response.statusCode, 201);
    return body<{ item: { id: string; userId: string } }>(response).item;
  };

  const employeeA = await createEmployee("Employee A", "13800000001", "employee-a-create");
  const employeeB = await createEmployee("Employee B", "13800000002", "employee-b-create");
  const grantAssignedOrderAccess = async (accountId: string) => {
    const response = await app.inject({
      method: "PUT",
      url: `/api/accounts/${accountId}/authorization`,
      headers: adminHeaders,
      payload: {
        grants: [
          { permission: "orders.view", scope: "assigned", assignedUserIds: [] },
          { permission: "orders.status.update", scope: "assigned", assignedUserIds: [] },
          { permission: "orders.follow_up", scope: "assigned", assignedUserIds: [] }
        ],
        dataScopes: [{ resource: "orders", scope: "assigned", assignedUserIds: [] }]
      }
    });
    assert.equal(response.statusCode, 200);
  };
  await grantAssignedOrderAccess(employeeA.id);
  await grantAssignedOrderAccess(employeeB.id);

  const assignment = await app.inject({
    method: "PATCH",
    url: "/api/orders/order-demo/assignee",
    headers: adminHeaders,
    payload: { ownerUserId: employeeA.userId }
  });
  assert.equal(assignment.statusCode, 200);
  assert.equal(body<{ item: { ownerUserId: string; ownerName: string } }>(assignment).item.ownerUserId, employeeA.userId);
  assert.equal(body<{ item: { ownerName: string } }>(assignment).item.ownerName, "Employee A");

  const employeeAHeaders = { "x-test-user": employeeA.userId };
  const employeeBHeaders = { "x-test-user": employeeB.userId };
  const employeeSession = await app.inject({ method: "GET", url: "/api/session", headers: employeeAHeaders });
  assert.equal(employeeSession.statusCode, 200);
  assert.equal(body<{ mustChangePassword: boolean }>(employeeSession).mustChangePassword, true);
  for (const headers of [employeeAHeaders, employeeBHeaders]) {
    const changed = await app.inject({
      method: "POST",
      url: "/api/me/change-password",
      headers,
      payload: { currentPassword: "Test123!", newPassword: "Changed6!" }
    });
    assert.equal(changed.statusCode, 200);
  }
  const activeEmployeeSession = await app.inject({ method: "GET", url: "/api/session", headers: employeeAHeaders });
  const employeeSessionBody = body<{
    effectivePermissions: string[];
    dataScopes: Record<string, { scope: string; assignedUserIds: string[] }>;
    fieldPolicy: { price: string; inventory: string };
  }>(activeEmployeeSession);
  assert.equal(employeeSessionBody.effectivePermissions.includes("orders.view"), true);
  assert.equal(employeeSessionBody.effectivePermissions.includes("orders.assign"), false);
  assert.equal(employeeSessionBody.dataScopes.orders?.scope, "assigned");
  assert.equal(employeeSessionBody.fieldPolicy.price, "none");
  assert.equal(employeeSessionBody.fieldPolicy.inventory, "none");
  const ownOrders = await app.inject({ method: "GET", url: "/api/orders", headers: employeeAHeaders });
  assert.equal(ownOrders.statusCode, 200);
  assert.deepEqual(body<{ items: Array<{ id: string }> }>(ownOrders).items.map((item) => item.id), ["order-demo"]);

  const otherOrders = await app.inject({ method: "GET", url: "/api/orders", headers: employeeBHeaders });
  assert.equal(otherOrders.statusCode, 200);
  assert.equal(body<{ items: unknown[] }>(otherOrders).items.length, 0);
  assert.equal((await app.inject({ method: "GET", url: "/api/orders/order-demo", headers: employeeBHeaders })).statusCode, 404);
  assert.equal((await app.inject({ method: "GET", url: "/api/accounts", headers: employeeAHeaders })).statusCode, 403);
  assert.equal((await app.inject({ method: "GET", url: "/api/price-lists", headers: employeeAHeaders })).statusCode, 403);
  assert.equal((await app.inject({
    method: "PATCH", url: "/api/orders/order-demo/assignee", headers: employeeAHeaders, payload: { ownerUserId: employeeB.userId }
  })).statusCode, 403);

  const followUp = await app.inject({
    method: "POST",
    url: "/api/orders/order-demo/follow-ups",
    headers: employeeAHeaders,
    payload: { content: "Checked production readiness" }
  });
  assert.equal(followUp.statusCode, 201);
  assert.equal(body<{ item: { authorUserId: string; authorName: string } }>(followUp).item.authorUserId, employeeA.userId);
  assert.equal(body<{ item: { authorName: string } }>(followUp).item.authorName, "Employee A");

  const reassignment = await app.inject({
    method: "PATCH",
    url: "/api/orders/order-demo/assignee",
    headers: adminHeaders,
    payload: { ownerUserId: employeeB.userId }
  });
  assert.equal(reassignment.statusCode, 200);
  assert.equal((await app.inject({ method: "GET", url: "/api/orders/order-demo", headers: employeeAHeaders })).statusCode, 404);
  assert.equal((await app.inject({ method: "GET", url: "/api/orders/order-demo", headers: employeeBHeaders })).statusCode, 200);

  const history = await app.inject({ method: "GET", url: "/api/orders/order-demo/follow-ups", headers: employeeBHeaders });
  assert.equal(history.statusCode, 200);
  assert.equal(body<{ items: Array<{ authorName: string }> }>(history).items[0]?.authorName, "Employee A");

  const disabled = await app.inject({
    method: "PATCH",
    url: `/api/employees/${employeeA.id}/status`,
    headers: adminHeaders,
    payload: { status: "disabled" }
  });
  assert.equal(disabled.statusCode, 200);
  assert.equal((await app.inject({ method: "GET", url: "/api/orders", headers: employeeAHeaders })).statusCode, 403);
});
