import type { IncomingHttpHeaders } from "node:http";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { admin, organization, phoneNumber, username } from "better-auth/plugins";
import {
  adminAc as organizationAdminRole,
  defaultAc as organizationAccessControl,
  defaultRoles as defaultOrganizationRoles,
  memberAc as organizationMemberRole,
  ownerAc as organizationOwnerRole
} from "better-auth/plugins/organization/access";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "./config.js";
import { AppError } from "./errors.js";

export interface AuthIdentity {
  user: { id: string; name: string; email: string };
  activeTenantId?: string;
}

export interface AuthService {
  readonly mode: "development" | "better-auth";
  handle(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  getIdentity(headers: IncomingHttpHeaders): Promise<AuthIdentity | null>;
  createEmployee?(input: { organizationId: string; name: string; phone: string; email?: string; password: string }): Promise<{ userId: string }>;
  createOrganizationAdmin?(input: { organizationId: string; name: string; phone: string; email?: string; password: string; role: "headquarters_admin" | "dealer_admin" }): Promise<{ userId: string }>;
  createDealerAdmin?(input: { organizationId: string; name: string; phone: string; email?: string; password: string }): Promise<{ userId: string }>;
}

function placeholderEmail(phone: string): string {
  return `phone.${phone.replace(/\D/g, "")}@phone-login.invalid`;
}

function webHeaders(headers: IncomingHttpHeaders): Headers {
  const result = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (Array.isArray(value)) value.forEach((entry) => result.append(name, entry));
    else if (value !== undefined) result.set(name, value);
  }
  return result;
}

const organizationRoles = {
  ...defaultOrganizationRoles,
  headquarters_admin: organizationOwnerRole,
  headquarters_sales: organizationMemberRole,
  headquarters_reviewer: organizationMemberRole,
  production_shipping: organizationMemberRole,
  factory_employee: organizationMemberRole,
  dealer_admin: organizationAdminRole,
  dealer_designer_sales: organizationMemberRole
} as const;

export function createBetterAuth(
  config: AppConfig,
  database: unknown,
  schema: Record<string, unknown>
) {
  if (!config.betterAuthSecret) throw new Error("BETTER_AUTH_SECRET is required for Better Auth");

  return betterAuth({
    appName: "USM ERP",
    baseURL: config.betterAuthUrl,
    basePath: "/api/auth",
    secret: config.betterAuthSecret,
    trustedOrigins: config.corsOrigins,
    database: drizzleAdapter(database as never, {
      provider: "pg",
      schema: schema as never
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12
    },
    advanced: {
      cookiePrefix: "usm-erp",
      useSecureCookies: config.sessionCookieSecure,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: config.sessionCookieSecure,
        path: "/"
      }
    },
    plugins: [
      admin({ defaultRole: "user", adminRoles: ["admin"] }),
      username({
        minUsernameLength: 2,
        usernameValidator: (value) => /^[\p{L}\p{N}_.-]+$/u.test(value)
      }),
      phoneNumber({
        sendOTP: async () => undefined,
        phoneNumberValidator: (value) => /^\+[1-9]\d{7,14}$/.test(value)
      }),
      organization({
        allowUserToCreateOrganization: false,
        creatorRole: "headquarters_admin",
        ac: organizationAccessControl,
        roles: organizationRoles
      } as never)
    ]
  });
}

export function createAuthService(
  config: AppConfig,
  database?: unknown,
  schema?: Record<string, unknown>
): AuthService {
  if (!database || !config.databaseUrl || !config.betterAuthSecret) {
    return createDevelopmentAuth(config);
  }

  const auth = createBetterAuth(config, database, schema ?? {});

  return {
    mode: "better-auth",
    async handle(request, reply) {
      const url = new URL(request.raw.url ?? "/api/auth", config.betterAuthUrl);
      const headers = webHeaders(request.headers);
      const method = request.method.toUpperCase();
      const body = method === "GET" || method === "HEAD"
        ? undefined
        : typeof request.body === "string"
          ? request.body
          : JSON.stringify(request.body ?? {});
      if (body !== undefined && !headers.has("content-type")) headers.set("content-type", "application/json");
      const response = await auth.handler(new Request(url, { method, headers, body }));
      reply.code(response.status);
      response.headers.forEach((value, name) => {
        if (name !== "set-cookie") reply.header(name, value);
      });
      for (const value of response.headers.getSetCookie()) reply.raw.appendHeader("set-cookie", value);
      reply.send(Buffer.from(await response.arrayBuffer()));
    },
    async getIdentity(headers) {
      const session = await auth.api.getSession({ headers: webHeaders(headers) });
      if (!session?.user) return null;
      const rawSession = session.session as typeof session.session & { activeOrganizationId?: string | null };
      return {
        user: {
          id: session.user.id,
          name: session.user.name,
          email: session.user.email
        },
        activeTenantId: rawSession.activeOrganizationId ?? undefined
      };
    },
    async createEmployee(input) {
      const created = await auth.api.createUser({
        body: {
          name: input.name,
          email: input.email ?? placeholderEmail(input.phone),
          password: input.password,
          role: "user",
          data: { phoneNumber: input.phone, phoneNumberVerified: true }
        }
      });
      await auth.api.addMember({
        body: { organizationId: input.organizationId, userId: created.user.id, role: "factory_employee" }
      } as never);
      return { userId: created.user.id };
    },
    async createOrganizationAdmin(input) {
      const created = await auth.api.createUser({
        body: {
          name: input.name,
          email: input.email ?? placeholderEmail(input.phone),
          password: input.password,
          role: "user",
          data: { phoneNumber: input.phone, phoneNumberVerified: true }
        }
      });
      await auth.api.addMember({
        body: { organizationId: input.organizationId, userId: created.user.id, role: input.role }
      } as never);
      return { userId: created.user.id };
    },
    async createDealerAdmin(input) {
      const created = await auth.api.createUser({
        body: {
          name: input.name,
          email: input.email ?? placeholderEmail(input.phone),
          password: input.password,
          role: "user",
          data: { phoneNumber: input.phone, phoneNumberVerified: true }
        }
      });
      await auth.api.addMember({
        body: { organizationId: input.organizationId, userId: created.user.id, role: "dealer_admin" }
      } as never);
      return { userId: created.user.id };
    }
  };
}

function createDevelopmentAuth(config: AppConfig): AuthService {
  const cookieName = "usm_dev_session";
  const identity: AuthIdentity = {
    user: { id: "user-demo", name: "本地管理员", email: config.devAuthEmail },
    activeTenantId: "tenant-demo"
  };
  const accounts = new Map<string, { identity: AuthIdentity; password: string }>([
    [identity.user.email.toLowerCase(), { identity, password: config.devAuthPassword }]
  ]);
  const identities = new Map<string, AuthIdentity>([[identity.user.id, identity]]);

  return {
    mode: "development",
    async handle(request, reply) {
      const path = request.url.split("?")[0];
      if (path.endsWith("/sign-in/email") || path.endsWith("/sign-in/username") || path.endsWith("/sign-in/phone-number")) {
        const body = request.body as { email?: string; username?: string; phoneNumber?: string; password?: string } | undefined;
        const account = body?.phoneNumber ?? body?.email ?? body?.username;
        const record = account ? accounts.get(account.toLowerCase()) : undefined;
        if (!record || body?.password !== record.password) {
          throw new AppError(401, "UNAUTHORIZED", "Invalid development credentials");
        }
        reply.setCookie(cookieName, record.identity.user.id, {
          httpOnly: true, sameSite: "lax", path: "/", secure: config.sessionCookieSecure
        });
        reply.send({ user: record.identity.user, redirect: false });
        return;
      }
      if (path.endsWith("/sign-out")) {
        reply.clearCookie(cookieName, { path: "/" });
        reply.send({ success: true });
        return;
      }
      if (path.endsWith("/get-session")) {
        const sessionUserId = request.cookies[cookieName];
        const current = identities.get(sessionUserId ?? "") ?? (config.devAuthAutoLogin ? identity : null);
        reply.send(current ? { user: current.user, session: { activeOrganizationId: current.activeTenantId } } : null);
        return;
      }
      throw new AppError(404, "NOT_FOUND", "Development auth endpoint not found");
    },
    async getIdentity(headers) {
      const cookies = headers.cookie ?? "";
      const sessionUserId = cookies.split(";").map((part) => part.trim().split("=", 2)).find(([name]) => name === cookieName)?.[1];
      return (sessionUserId ? identities.get(sessionUserId) : null) ?? (config.devAuthAutoLogin ? identity : null);
    },
    async createEmployee(input) {
      const userId = `employee-${crypto.randomUUID()}`;
      const created: AuthIdentity = {
        user: { id: userId, name: input.name, email: input.email ?? placeholderEmail(input.phone) },
        activeTenantId: input.organizationId
      };
      identities.set(userId, created);
      accounts.set(input.phone, { identity: created, password: input.password });
      if (input.email) accounts.set(input.email.toLowerCase(), { identity: created, password: input.password });
      return { userId };
    },
    async createOrganizationAdmin(input) {
      const phoneKey = input.phone.toLowerCase();
      const emailKey = input.email?.toLowerCase();
      if (accounts.has(phoneKey) || (emailKey && accounts.has(emailKey))) {
        throw new AppError(409, "IDEMPOTENCY_CONFLICT", "An account with this phone number or email already exists");
      }
      const userId = `organization-admin-${crypto.randomUUID()}`;
      const created: AuthIdentity = {
        user: { id: userId, name: input.name, email: input.email ?? placeholderEmail(input.phone) },
        activeTenantId: input.organizationId
      };
      identities.set(userId, created);
      accounts.set(phoneKey, { identity: created, password: input.password });
      if (emailKey) accounts.set(emailKey, { identity: created, password: input.password });
      return { userId };
    },
    async createDealerAdmin(input) {
      const userId = `dealer-admin-${crypto.randomUUID()}`;
      const created: AuthIdentity = {
        user: { id: userId, name: input.name, email: input.email ?? placeholderEmail(input.phone) },
        activeTenantId: input.organizationId
      };
      identities.set(userId, created);
      accounts.set(input.phone, { identity: created, password: input.password });
      if (input.email) accounts.set(input.email.toLowerCase(), { identity: created, password: input.password });
      return { userId };
    }
  };
}
