import assert from "node:assert/strict";
import type { IncomingHttpHeaders } from "node:http";
import test from "node:test";
import type { Role } from "@usm/contracts";
import { buildApp } from "../src/app.js";
import type { AuthIdentity, AuthService } from "../src/auth.js";
import { loadConfig } from "../src/config.js";
import { MemoryRepository } from "../src/memory-repository.js";

const enterpriseApprovalRoles: Role[] = ["owner", "admin", "headquarters_admin"];

function testRole(headers: IncomingHttpHeaders): Role {
  const value = headers["x-test-role"];
  const role = Array.isArray(value) ? value[0] : value;
  return (role ?? "owner") as Role;
}

function createTestAuth(): AuthService {
  return {
    mode: "development",
    async handle() {
      throw new Error("Test auth does not expose auth routes");
    },
    async getIdentity(headers) {
      const role = testRole(headers);
      const identity: AuthIdentity = {
        user: { id: `role-${role}`, name: role, email: `${role}@example.test` },
        activeTenantId: "tenant-demo"
      };
      return identity;
    }
  };
}

class RoleAwareMemoryRepository extends MemoryRepository {
  override async resolveMembership(userId: string, preferredTenantId?: string) {
    const membership = await super.resolveMembership("user-demo", preferredTenantId);
    return membership ? { ...membership, role: userId.replace("role-", "") as Role } : null;
  }
}

test("only enterprise administrators receive quote approval authority", async (context) => {
  const repository = new RoleAwareMemoryRepository();
  const app = await buildApp(
    { ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" },
    { auth: createTestAuth(), repository }
  );
  context.after(() => app.close());

  for (const role of enterpriseApprovalRoles) {
    const response = await app.inject({ method: "GET", url: "/api/session", headers: { "x-test-role": role } });
    assert.equal(response.statusCode, 200);
    assert.equal(JSON.parse(response.body).permissions.includes("quotes:approve"), true);
  }

  const salesSession = await app.inject({ method: "GET", url: "/api/session", headers: { "x-test-role": "sales" } });
  assert.equal(JSON.parse(salesSession.body).permissions.includes("quotes:approve"), false);

  const submitted = await repository.transitionQuote("tenant-demo", "quote-demo", 1, "submitted");
  const salesAttempt = await app.inject({
    method: "POST",
    url: "/api/quotes/quote-demo/transitions",
    headers: { "x-test-role": "sales", "if-match": String(submitted.revision), "idempotency-key": "sales-quote-approval" },
    payload: { to: "approved" }
  });
  assert.equal(salesAttempt.statusCode, 403);

  const adminApproval = await app.inject({
    method: "POST",
    url: "/api/quotes/quote-demo/transitions",
    headers: { "x-test-role": "admin", "if-match": String(submitted.revision), "idempotency-key": "admin-quote-approval" },
    payload: { to: "approved" }
  });
  assert.equal(adminApproval.statusCode, 200);
  assert.equal(JSON.parse(adminApproval.body).item.status, "approved");
});
