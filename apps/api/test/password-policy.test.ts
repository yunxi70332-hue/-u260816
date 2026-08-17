import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

function json<T>(body: string): T {
  return JSON.parse(body) as T;
}

function cookieHeader(response: { headers: Record<string, string | string[] | undefined> }): string {
  const value = response.headers["set-cookie"];
  return Array.isArray(value) ? value[0] : String(value ?? "");
}

test("temporary passwords accept 6-12 characters and reject values outside that range", async (context) => {
  const app = await buildApp({ ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" });
  context.after(() => app.close());

  for (const [phone, password] of [["13800000771", "Ab1!56"], ["13800000772", "Ab1!56789012"]]) {
    const response = await app.inject({
      method: "POST",
      url: "/api/employees",
      headers: { "idempotency-key": `password-boundary-valid-${phone}` },
      payload: { name: `Valid password ${phone}`, phone, password }
    });
    assert.equal(response.statusCode, 201);
  }

  for (const [phone, password] of [["13800000773", "Ab1!5"], ["13800000774", "Ab1!567890123"]]) {
    const response = await app.inject({
      method: "POST",
      url: "/api/employees",
      headers: { "idempotency-key": `password-boundary-invalid-${phone}` },
      payload: { name: `Invalid password ${phone}`, phone, password }
    });
    assert.equal(response.statusCode, 422);
    assert.equal(json<{ error: { code: string } }>(response.body).error.code, "VALIDATION_ERROR");
  }
});

test("new accounts must change their 6-12 character temporary password before using ERP APIs", async (context) => {
  const app = await buildApp({ ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" });
  context.after(() => app.close());

  const created = await app.inject({
    method: "POST",
    url: "/api/employees",
    headers: { "idempotency-key": "password-policy-employee" },
    payload: { name: "Password Policy Employee", phone: "13800000777", password: "Temp123!" }
  });
  assert.equal(created.statusCode, 201);
  const signIn = await app.inject({
    method: "POST",
    url: "/api/auth/sign-in/phone-number",
    payload: { phoneNumber: "+8613800000777", password: "Temp123!" }
  });
  assert.equal(signIn.statusCode, 200);
  const headers = { cookie: cookieHeader(signIn) };

  const session = await app.inject({ method: "GET", url: "/api/session", headers });
  assert.equal(session.statusCode, 200);
  assert.equal(json<{ mustChangePassword: boolean }>(session.body).mustChangePassword, true);
  const blocked = await app.inject({ method: "GET", url: "/api/projects", headers });
  assert.equal(blocked.statusCode, 409);
  assert.equal(json<{ error: { code: string } }>(blocked.body).error.code, "PASSWORD_CHANGE_REQUIRED");

  const changed = await app.inject({
    method: "POST",
    url: "/api/me/change-password",
    headers,
    payload: { currentPassword: "Temp123!", newPassword: "Changed6!" }
  });
  assert.equal(changed.statusCode, 200);
  const refreshed = await app.inject({ method: "GET", url: "/api/session", headers });
  assert.equal(json<{ mustChangePassword: boolean }>(refreshed.body).mustChangePassword, false);
  assert.equal((await app.inject({ method: "GET", url: "/api/projects", headers })).statusCode, 403);
});

test("an upper administrator can reset a lower account password and force the next login change", async (context) => {
  const app = await buildApp({ ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" });
  context.after(() => app.close());

  const created = await app.inject({
    method: "POST",
    url: "/api/employees",
    headers: { "idempotency-key": "password-reset-employee" },
    payload: { name: "Resettable Employee", phone: "13800000778", password: "Temp123!" }
  });
  const accountId = json<{ item: { id: string } }>(created.body).item.id;
  const reset = await app.inject({
    method: "POST",
    url: `/api/accounts/${accountId}/reset-password`,
    payload: { newPassword: "Reset123!" }
  });
  assert.equal(reset.statusCode, 200);

  const signIn = await app.inject({
    method: "POST",
    url: "/api/auth/sign-in/phone-number",
    payload: { phoneNumber: "+8613800000778", password: "Reset123!" }
  });
  assert.equal(signIn.statusCode, 200);
  const headers = { cookie: cookieHeader(signIn) };
  assert.equal(json<{ mustChangePassword: boolean }>((await app.inject({ method: "GET", url: "/api/session", headers })).body).mustChangePassword, true);
});

test("organization administrators cannot reset their own or peer administrator passwords", async (context) => {
  const app = await buildApp({ ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" });
  context.after(() => app.close());

  const createAdministrator = async (name: string, phone: string, key: string) => {
    const response = await app.inject({
      method: "POST",
      url: "/api/organization/admins",
      headers: { "idempotency-key": key },
      payload: { name, phone, password: "Admin123!" }
    });
    assert.equal(response.statusCode, 201);
    return json<{ item: { id: string } }>(response.body).item;
  };

  const actor = await createAdministrator("Password Reset Actor", "13800000775", "password-reset-actor");
  const peer = await createAdministrator("Password Reset Peer", "13800000776", "password-reset-peer");
  const signIn = await app.inject({
    method: "POST",
    url: "/api/auth/sign-in/phone-number",
    payload: { phoneNumber: "+8613800000775", password: "Admin123!" }
  });
  assert.equal(signIn.statusCode, 200);
  const headers = { cookie: cookieHeader(signIn) };
  const changed = await app.inject({
    method: "POST",
    url: "/api/me/change-password",
    headers,
    payload: { currentPassword: "Admin123!", newPassword: "Changed6!" }
  });
  assert.equal(changed.statusCode, 200);

  for (const accountId of [actor.id, peer.id]) {
    const reset = await app.inject({
      method: "POST",
      url: `/api/accounts/${accountId}/reset-password`,
      headers,
      payload: { newPassword: "Reset123!" }
    });
    assert.equal(reset.statusCode, 403);
    assert.equal(json<{ error: { code: string } }>(reset.body).error.code, "FORBIDDEN");
  }
});
