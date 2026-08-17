import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createBetterAuth } from "./auth.js";
import { loadConfig, type AppConfig } from "./config.js";
import { createDatabase, type Database } from "./db/index.js";
import * as schema from "./db/schema.js";
import { members, organizations, users } from "./db/schema.js";
import { legacyPermissionsForRole } from "./authorization.js";
import type { Permission, Role } from "@usm/contracts";

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../drizzle"
);

export async function migrateProductionDatabase(database: Database): Promise<void> {
  await migrate(database, { migrationsFolder });
  console.info("Database schema migrations completed");
}

/** Convert the legacy membership role into explicit grants once, then stop reading it for auth. */
export async function migrateLegacyMemberAuthorizations(database: Database): Promise<void> {
  await database.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('usm-erp-legacy-authorization-v1'))`);
    const rows = await tx.select({
      id: members.id,
      organizationId: members.organizationId,
      role: members.role,
      permissionConfigured: members.permissionConfigured,
      organizationType: organizations.organizationType,
      globalRole: users.role
    }).from(members)
      .innerJoin(organizations, eq(organizations.id, members.organizationId))
      .innerJoin(users, eq(users.id, members.userId));

    for (const row of rows) {
      if (row.globalRole === "admin") {
        const removedGrants = await tx.delete(schema.memberPermissionGrants)
          .where(and(
            eq(schema.memberPermissionGrants.organizationId, row.organizationId),
            eq(schema.memberPermissionGrants.memberId, row.id)
          ))
          .returning({ id: schema.memberPermissionGrants.id });
        const removedScopes = await tx.delete(schema.memberDataScopes)
          .where(and(
            eq(schema.memberDataScopes.organizationId, row.organizationId),
            eq(schema.memberDataScopes.memberId, row.id)
          ))
          .returning({ id: schema.memberDataScopes.id });
        if (!row.permissionConfigured || removedGrants.length || removedScopes.length) {
          await tx.update(members).set({ permissionConfigured: true, updatedAt: new Date() }).where(eq(members.id, row.id));
          await tx.insert(schema.authorizationAuditLogs).values({
            id: randomUUID(), organizationId: row.organizationId, targetMemberId: row.id,
            action: "platform_operator.business_authorization.cleared",
            before: { role: row.role, removedGrantCount: removedGrants.length, removedScopeCount: removedScopes.length },
            after: { permissions: [] }
          });
        }
        continue;
      }
      if (row.permissionConfigured) continue;
      const knownRoles = new Set<Role>([
        "owner", "admin", "sales", "designer", "production", "finance", "member", "viewer",
        "headquarters_admin", "headquarters_sales", "headquarters_reviewer", "production_shipping",
        "dealer_admin", "dealer_designer_sales", "factory_employee"
      ]);
      const role = knownRoles.has(row.role as Role) ? row.role as Role : "member";
      const permissions = legacyPermissionsForRole(role, row.organizationType);
      const employeeScope = role === "factory_employee" ? "assigned" : "organization";
      if (permissions.length) {
        await tx.insert(schema.memberPermissionGrants).values(permissions.map((permission: Permission) => ({
          id: randomUUID(), organizationId: row.organizationId, memberId: row.id, permission,
          scope: employeeScope, assignedUserIds: []
        }))).onConflictDoNothing();
      }
      if (role === "factory_employee") {
        await tx.insert(schema.memberDataScopes).values({
          id: randomUUID(), organizationId: row.organizationId, memberId: row.id,
          resource: "orders", scope: "assigned", assignedUserIds: []
        }).onConflictDoNothing();
      }
      await tx.update(members).set({ permissionConfigured: true, updatedAt: new Date() }).where(eq(members.id, row.id));
      await tx.insert(schema.authorizationAuditLogs).values({
        id: randomUUID(), organizationId: row.organizationId, targetMemberId: row.id,
        action: "account.authorization.migrated", before: { role: row.role },
        after: { permissions, dataScope: role === "factory_employee" ? { resource: "orders", scope: "assigned" } : null }
      });
    }
  });
  console.info("Legacy member authorization migration completed");
}

export async function bootstrapProductionDatabase(config: AppConfig, database: Database): Promise<void> {
  if (!config.bootstrapAdminEmail || !config.bootstrapAdminPassword) {
    console.info("Bootstrap administrator is not configured; skipping auth bootstrap");
    return;
  }

  const auth = createBetterAuth(config, database, schema);
  const email = config.bootstrapAdminEmail;
  let [user] = await database.select({
    id: users.id,
    role: users.role
  }).from(users).where(eq(users.email, email)).limit(1);

  if (!user) {
    const created = await auth.api.createUser({
      body: {
        email,
        password: config.bootstrapAdminPassword,
        name: config.bootstrapAdminName,
        role: "admin",
        data: config.bootstrapAdminUsername ? {
          username: config.bootstrapAdminUsername,
          displayUsername: config.bootstrapAdminUsername
        } : undefined
      }
    });
    user = { id: created.user.id, role: created.user.role ?? "admin" };
    await database.update(users).set({ mustChangePassword: true, updatedAt: new Date() }).where(eq(users.id, user.id));
    console.info(`Created bootstrap administrator ${email}`);
  } else if (user.role !== "admin") {
    await database.update(users).set({ role: "admin", updatedAt: new Date() }).where(eq(users.id, user.id));
    console.info(`Promoted bootstrap administrator ${email}`);
  }

  let [organization] = await database.select({ id: organizations.id }).from(organizations)
    .where(eq(organizations.slug, config.bootstrapOrganizationSlug)).limit(1);
  if (!organization) {
    const created = await auth.api.createOrganization({
      body: {
        name: config.bootstrapOrganizationName,
        slug: config.bootstrapOrganizationSlug,
        userId: user.id
      }
    });
    organization = { id: created.id };
    console.info(`Created bootstrap organization ${config.bootstrapOrganizationSlug}`);
  }

  const [membership] = await database.select({ id: members.id, role: members.role, status: members.status })
    .from(members)
    .where(and(eq(members.organizationId, organization.id), eq(members.userId, user.id)))
    .limit(1);
  if (!membership) {
    await auth.api.addMember({
      body: {
        organizationId: organization.id,
        userId: user.id,
        role: "admin"
      }
    } as never);
    await database.update(members).set({
      role: "headquarters_admin",
      updatedAt: new Date()
    }).where(and(eq(members.organizationId, organization.id), eq(members.userId, user.id)));
    console.info(`Added ${email} to ${config.bootstrapOrganizationSlug}`);
  } else if (membership.role !== "headquarters_admin" || membership.status !== "active") {
    await database.update(members).set({
      role: "headquarters_admin",
      status: "active",
      updatedAt: new Date()
    }).where(eq(members.id, membership.id));
    console.info(`Updated ${email} headquarters membership`);
  }
}

async function runCli(): Promise<void> {
  const config = loadConfig();
  if (!config.databaseUrl) throw new Error("DATABASE_URL is required to bootstrap authentication");
  const database = createDatabase(config.databaseUrl);
  try {
    await migrateProductionDatabase(database);
    await bootstrapProductionDatabase(config, database);
    await migrateLegacyMemberAuthorizations(database);
  } finally {
    await database.$client.end();
  }
}

if (process.argv.includes("--run")) {
  runCli().catch((error) => {
    console.error("Authentication bootstrap failed", error);
    process.exitCode = 1;
  });
}
