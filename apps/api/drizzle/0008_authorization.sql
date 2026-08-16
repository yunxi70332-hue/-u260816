CREATE TABLE IF NOT EXISTS "organization_entitlements" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "module" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "permission_allowlist" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "organization_entitlements_org_module_unique" UNIQUE("organization_id", "module")
);
ALTER TABLE "member" ADD COLUMN IF NOT EXISTS "permission_configured" boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "organization_entitlements_org_idx" ON "organization_entitlements" ("organization_id");

CREATE TABLE IF NOT EXISTS "member_permission_grants" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "member_id" text NOT NULL REFERENCES "member"("id") ON DELETE CASCADE,
  "permission" text NOT NULL,
  "scope" text NOT NULL DEFAULT 'organization',
  "assigned_user_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "member_permission_grants_member_permission_unique" UNIQUE("member_id", "permission")
);
CREATE INDEX IF NOT EXISTS "member_permission_grants_org_idx" ON "member_permission_grants" ("organization_id");
CREATE INDEX IF NOT EXISTS "member_permission_grants_member_idx" ON "member_permission_grants" ("member_id");

CREATE TABLE IF NOT EXISTS "member_data_scopes" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "member_id" text NOT NULL REFERENCES "member"("id") ON DELETE CASCADE,
  "resource" text NOT NULL,
  "scope" text NOT NULL DEFAULT 'organization',
  "assigned_user_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "member_data_scopes_member_resource_unique" UNIQUE("member_id", "resource")
);
CREATE INDEX IF NOT EXISTS "member_data_scopes_org_idx" ON "member_data_scopes" ("organization_id");
CREATE INDEX IF NOT EXISTS "member_data_scopes_member_idx" ON "member_data_scopes" ("member_id");

CREATE TABLE IF NOT EXISTS "authorization_audit_logs" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "actor_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "target_member_id" text REFERENCES "member"("id") ON DELETE SET NULL,
  "action" text NOT NULL,
  "before" jsonb,
  "after" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "authorization_audit_logs_org_created_idx" ON "authorization_audit_logs" ("organization_id", "created_at");
CREATE INDEX IF NOT EXISTS "authorization_audit_logs_target_idx" ON "authorization_audit_logs" ("target_member_id");
