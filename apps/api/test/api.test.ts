import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

function body<T>(response: { body: string }): T {
  return JSON.parse(response.body) as T;
}

test("developer mode exposes a scoped session and seed data", async (context) => {
  const app = await buildApp({ ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" });
  context.after(() => app.close());

  const session = await app.inject({ method: "GET", url: "/api/session" });
  assert.equal(session.statusCode, 200);
  const sessionBody = body<{
    authenticated: boolean;
    enabledModules: string[];
    effectivePermissions: string[];
    delegablePermissions: string[];
    dataScopes: Record<string, { scope: string; assignedUserIds: string[] }>;
    fieldPolicy: { price: string; inventory: string };
  }>(session);
  assert.equal(sessionBody.authenticated, true);
  assert.ok(sessionBody.enabledModules.length > 0);
  assert.ok(sessionBody.effectivePermissions.length > 0);
  assert.ok(Array.isArray(sessionBody.delegablePermissions));
  assert.equal(typeof sessionBody.dataScopes, "object");
  assert.equal(typeof sessionBody.fieldPolicy.price, "string");
  assert.equal(typeof sessionBody.fieldPolicy.inventory, "string");

  const quotes = await app.inject({ method: "GET", url: "/api/quotes" });
  assert.equal(body<{ items: unknown[] }>(quotes).items.length, 1);
});

test("project responses include the linked customer name and latest quote total", async (context) => {
  const app = await buildApp({ ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" });
  context.after(() => app.close());

  const projects = await app.inject({ method: "GET", url: "/api/projects" });
  assert.equal(projects.statusCode, 200);
  const quotes = await app.inject({ method: "GET", url: "/api/quotes?projectId=project-demo" });
  const seededQuoteTotal = body<{ items: Array<{ totalMinor: number }> }>(quotes).items[0]?.totalMinor;
  assert.equal(typeof seededQuoteTotal, "number");
  const listItem = body<{ items: Array<{ id: string; customerId: string | null; customerName: string | null; ownerUserId: string | null; ownerName: string | null; quoteTotalMinor: number | null; quoteCurrency: string | null }> }>(projects)
    .items.find((item) => item.id === "project-demo");
  assert.ok(listItem);
  assert.equal(listItem.customerId, "customer-demo");
  assert.equal(listItem.customerName, "林女士");
  assert.equal(listItem.ownerUserId, "user-demo");
  assert.equal(listItem.ownerName, "本地管理员");
  assert.equal(listItem.quoteTotalMinor, seededQuoteTotal);
  assert.equal(listItem.quoteCurrency, "CNY");

  const project = await app.inject({ method: "GET", url: "/api/projects/project-demo" });
  assert.equal(project.statusCode, 200);
  const projectItem = body<{ item: { customerName: string | null; ownerName: string | null; quoteTotalMinor: number | null; quoteCurrency: string | null } }>(project).item;
  assert.equal(projectItem.customerName, "林女士");
  assert.equal(projectItem.ownerName, "本地管理员");
  assert.equal(projectItem.quoteTotalMinor, seededQuoteTotal);
  assert.equal(projectItem.quoteCurrency, "CNY");
});

test("quote and order responses include their linked customer and project names", async (context) => {
  const app = await buildApp({ ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" });
  context.after(() => app.close());

  const quotes = await app.inject({ method: "GET", url: "/api/quotes" });
  assert.equal(quotes.statusCode, 200);
  const quote = body<{ items: Array<{ id: string; customerName: string | null; projectName: string | null; ownerName: string | null }> }>(quotes)
    .items.find((item) => item.id === "quote-demo");
  assert.ok(quote);
  assert.equal(quote.customerName, "林女士");
  assert.equal(quote.projectName, "静安客厅组合柜");
  assert.equal(quote.ownerName, null);

  const quoteDetail = await app.inject({ method: "GET", url: "/api/quotes/quote-demo" });
  assert.equal(quoteDetail.statusCode, 200);
  assert.equal(body<{ item: { customerName: string | null; projectName: string | null } }>(quoteDetail).item.customerName, "林女士");
  assert.equal(body<{ item: { customerName: string | null; projectName: string | null } }>(quoteDetail).item.projectName, "静安客厅组合柜");

  const orders = await app.inject({ method: "GET", url: "/api/orders" });
  assert.equal(orders.statusCode, 200);
  const order = body<{ items: Array<{ id: string; customerName: string | null; projectName: string | null }> }>(orders)
    .items.find((item) => item.id === "order-demo");
  assert.ok(order);
  assert.equal(order.customerName, "林女士");
  assert.equal(order.projectName, "静安客厅组合柜");

  const orderDetail = await app.inject({ method: "GET", url: "/api/orders/order-demo" });
  assert.equal(orderDetail.statusCode, 200);
  assert.equal(body<{ item: { customerName: string | null; projectName: string | null } }>(orderDetail).item.customerName, "林女士");
  assert.equal(body<{ item: { customerName: string | null; projectName: string | null } }>(orderDetail).item.projectName, "静安客厅组合柜");
});

test("employees and dealer administrators use phone number and password sign-in", async (context) => {
  const app = await buildApp({ ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" });
  context.after(() => app.close());
  const designResponse = await app.inject({ method: "GET", url: "/api/designs/design-demo" });
  const dealerConfigSnapshot = body<{ item: { configSnapshot: Record<string, unknown> } }>(designResponse).item.configSnapshot;

  const employee = await app.inject({
    method: "POST", url: "/api/employees", headers: { "idempotency-key": "phone-employee-test" },
    payload: { name: "手机号员工", phone: "138 1234 5678", password: "Phone123!" }
  });
  assert.equal(employee.statusCode, 201);
  assert.equal(body<{ item: { phone: string; email: string | null } }>(employee).item.phone, "+8613812345678");
  assert.equal(body<{ item: { phone: string; email: string | null } }>(employee).item.email, null);

  const employeeSignIn = await app.inject({
    method: "POST", url: "/api/auth/sign-in/phone-number",
    payload: { phoneNumber: "+8613812345678", password: "Phone123!" }
  });
  assert.equal(employeeSignIn.statusCode, 200);
  assert.equal(body<{ user: { name: string } }>(employeeSignIn).user.name, "手机号员工");
  const employeeCookie = employeeSignIn.headers["set-cookie"];
  assert.ok(employeeCookie);
  const employeeHeaders = { cookie: Array.isArray(employeeCookie) ? employeeCookie[0] : employeeCookie };
  const employeeSession = await app.inject({ method: "GET", url: "/api/session", headers: employeeHeaders });
  assert.equal(body<{ mustChangePassword: boolean }>(employeeSession).mustChangePassword, true);
  const employeePasswordChange = await app.inject({
    method: "POST",
    url: "/api/me/change-password",
    headers: employeeHeaders,
    payload: { currentPassword: "Phone123!", newPassword: "Changed6!" }
  });
  assert.equal(employeePasswordChange.statusCode, 200);

  const dealer = await app.inject({
    method: "POST", url: "/api/dealers", headers: { "idempotency-key": "phone-dealer-test" },
    payload: {
      name: "手机号经销商", contact: "渠道管理员",
      phone: "139 1234 5678", password: "Dealer123!", discountRate: 90
    }
  });
  assert.equal(dealer.statusCode, 201);
  assert.match(body<{ item: { code: string } }>(dealer).item.code, /^DLR-CN-[0-9A-F]{8}$/);
  assert.equal(body<{ item: { phone: string; email: string | null } }>(dealer).item.phone, "+8613912345678");
  assert.equal(body<{ item: { phone: string; email: string | null } }>(dealer).item.email, null);
  assert.equal(body<{ item: { region: string } }>(dealer).item.region, "");

  const dealerSignIn = await app.inject({
    method: "POST", url: "/api/auth/sign-in/phone-number",
    payload: { phoneNumber: "+8613912345678", password: "Dealer123!" }
  });
  assert.equal(dealerSignIn.statusCode, 200);
  const dealerCookie = dealerSignIn.headers["set-cookie"];
  assert.ok(dealerCookie);
  const dealerSession = await app.inject({
    method: "GET", url: "/api/session",
    headers: { cookie: Array.isArray(dealerCookie) ? dealerCookie[0] : dealerCookie }
  });
  assert.equal(dealerSession.statusCode, 200);
  assert.equal(body<{ mustChangePassword: boolean }>(dealerSession).mustChangePassword, true);
  const dealerHeaders = { cookie: Array.isArray(dealerCookie) ? dealerCookie[0] : dealerCookie };
  const dealerPasswordChange = await app.inject({
    method: "POST",
    url: "/api/me/change-password",
    headers: dealerHeaders,
    payload: { currentPassword: "Dealer123!", newPassword: "Changed6!" }
  });
  assert.equal(dealerPasswordChange.statusCode, 200);
  const activeDealerSession = await app.inject({ method: "GET", url: "/api/session", headers: dealerHeaders });
  const dealerSessionBody = body<{
    tenant: { id: string };
    membership: { role: string };
    enabledModules: string[];
    effectivePermissions: string[];
    fieldPolicy: { price: string; inventory: string };
  }>(activeDealerSession);
  assert.equal(dealerSessionBody.tenant.id, body<{ item: { organizationId: string } }>(dealer).item.organizationId);
  assert.equal(dealerSessionBody.membership.role, "dealer_admin");
  assert.equal(dealerSessionBody.fieldPolicy.price, "dealer_only");
  assert.equal(dealerSessionBody.fieldPolicy.inventory, "none");
  assert.equal(dealerSessionBody.enabledModules.includes("warehouse"), false);
  assert.equal(dealerSessionBody.effectivePermissions.includes("prices.master.view"), false);
  assert.equal(dealerSessionBody.effectivePermissions.includes("prices.cost.view"), false);
  assert.equal(dealerSessionBody.effectivePermissions.includes("inventory.quantity.view"), false);

  const dealerPriceLists = await app.inject({ method: "GET", url: "/api/price-lists", headers: dealerHeaders });
  assert.equal(dealerPriceLists.statusCode, 403);
  const factoryOrderFromDealer = await app.inject({ method: "GET", url: "/api/orders/order-demo", headers: dealerHeaders });
  assert.equal(factoryOrderFromDealer.statusCode, 404);
  const dealerPricingResponse = await app.inject({
    method: "POST",
    url: "/api/pricing/calculate",
    headers: dealerHeaders,
    payload: { configSnapshot: dealerConfigSnapshot, market: "中国大陆", currency: "CNY" }
  });
  assert.equal(dealerPricingResponse.statusCode, 200);
  const dealerPricing = body<Record<string, unknown>>(dealerPricingResponse);
  for (const field of ["retailTotalMinor", "priceList", "dealer", "settlementRatePercent"]) {
    assert.equal(Object.hasOwn(dealerPricing, field), false, `dealer pricing exposed ${field}`);
  }
  assert.equal(Object.hasOwn(dealerPricing, "totalMinor"), true);
  for (const line of Array.isArray(dealerPricing.lines) ? dealerPricing.lines : []) {
    const item = line as Record<string, unknown>;
    for (const field of ["unitPriceMinor", "lineTotalMinor", "dealerLineTotalMinor"]) {
      assert.equal(Object.hasOwn(item, field), false, `dealer pricing line exposed ${field}`);
    }
  }
  assert.equal(body<{ user: { name: string } }>(dealerSignIn).user.name, "渠道管理员");
});

test("dealer creation defaults an omitted contact to the dealer name", async (context) => {
  const app = await buildApp({ ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" });
  context.after(() => app.close());

  const dealer = await app.inject({
    method: "POST",
    url: "/api/dealers",
    headers: { "idempotency-key": "dealer-contact-default" },
    payload: {
      name: "Dealer Contact Default",
      phone: "139 8765 4321",
      password: "Dealer123!",
      discountRate: 90
    }
  });

  assert.equal(dealer.statusCode, 201);
  assert.equal(body<{ item: { contact: string } }>(dealer).item.contact, "Dealer Contact Default");
});

test("static ERP fallback never handles the API namespace", async (context) => {
  const erpStaticDir = await mkdtemp(path.join(tmpdir(), "usm-erp-static-"));
  await writeFile(path.join(erpStaticDir, "index.html"), "<!doctype html><title>ERP shell</title>");
  const app = await buildApp({ ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir });
  context.after(async () => {
    await app.close();
    await rm(erpStaticDir, { recursive: true, force: true });
  });

  const apiRoot = await app.inject({ method: "GET", url: "/api" });
  assert.equal(apiRoot.statusCode, 404);
  assert.equal(body<{ error: { code: string } }>(apiRoot).error.code, "NOT_FOUND");

  const deepLink = await app.inject({ method: "GET", url: "/quotes/example" });
  assert.equal(deepLink.statusCode, 200);
  assert.match(deepLink.body, /ERP shell/);
});

test("ERP development proxy coexists with CORS preflight handling", async (context) => {
  const config = loadConfig();
  const origin = config.corsOrigins[0];
  const app = await buildApp({ ...config, erpDevServerUrl: "http://127.0.0.1:65534" });
  context.after(() => app.close());

  const preflight = await app.inject({
    method: "OPTIONS",
    url: "/pricing",
    headers: {
      origin,
      "access-control-request-method": "GET"
    }
  });
  assert.equal(preflight.statusCode, 204);
  assert.equal(preflight.headers["access-control-allow-origin"], origin);
});

test("design updates ignore client BOM prices and enforce If-Match", async (context) => {
  const app = await buildApp({ ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" });
  context.after(() => app.close());

  const currentResponse = await app.inject({ method: "GET", url: "/api/designs/design-demo/draft" });
  const current = body<{ item: { draftRevision: number; configSnapshot: Record<string, unknown> } }>(currentResponse).item;
  const payload = {
    configSnapshot: current.configSnapshot,
    bomSnapshot: [{ name: "tampered", spec: "x", qty: 1, unit: "piece", unitPrice: 99_999_999 }],
    pricingSnapshot: { totalMinor: 1 }
  };

  const updatedResponse = await app.inject({
    method: "PUT", url: "/api/designs/design-demo/draft",
    headers: { "if-match": String(current.draftRevision) }, payload
  });
  assert.equal(updatedResponse.statusCode, 200);
  const updated = body<{ item: { draftRevision: number; bomSnapshot: Array<{ name: string }>; pricingSnapshot: { serverCalculated: boolean } } }>(updatedResponse).item;
  assert.equal(updated.bomSnapshot.some((line) => line.name === "tampered"), false);
  assert.equal(updated.pricingSnapshot.serverCalculated, true);

  const conflict = await app.inject({
    method: "PUT", url: "/api/designs/design-demo/draft",
    headers: { "if-match": String(current.draftRevision) }, payload
  });
  assert.equal(conflict.statusCode, 409);
  assert.equal(body<{ error: { code: string } }>(conflict).error.code, "VERSION_CONFLICT");
});

test("quote totals are recalculated and idempotent", async (context) => {
  const app = await buildApp({ ...loadConfig(), erpDevServerUrl: undefined, erpStaticDir: "missing" });
  context.after(() => app.close());

  const versionResponse = await app.inject({
    method: "POST", url: "/api/designs/design-demo/versions", payload: { note: "test" }
  });
  const versionId = body<{ item: { id: string } }>(versionResponse).item.id;
  const payload = {
    projectId: "project-demo", customerId: "customer-demo", designVersionId: versionId,
    currency: "CNY", discountMinor: 0, taxRateBasisPoints: 0, totalMinor: 1,
    lines: [{ unitPriceMinor: 1 }]
  };
  const headers = { "idempotency-key": "quote-idempotency-test" };
  const created = await app.inject({ method: "POST", url: "/api/quotes", headers, payload });
  const replay = await app.inject({ method: "POST", url: "/api/quotes", headers, payload });
  assert.equal(created.statusCode, 201);
  assert.equal(replay.headers["idempotency-replayed"], "true");
  const first = body<{ item: { id: string; totalMinor: number } }>(created).item;
  const second = body<{ item: { id: string } }>(replay).item;
  assert.notEqual(first.totalMinor, 1);
  assert.equal(first.id, second.id);
});
