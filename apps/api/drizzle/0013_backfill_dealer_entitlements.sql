-- Preserve the dealer product surface for organizations created before
-- entitlements became explicit. Warehouse, reports, audit, and factory-only
-- modules remain disabled until an operator grants them (and dealer policy
-- still prevents those permissions from being delegated).
WITH inserted_entitlements AS (
  INSERT INTO "organization_entitlements" (
    "id",
    "organization_id",
    "module",
    "enabled",
    "permission_allowlist"
  )
  SELECT
    md5('dealer-entitlement:' || organization_row."id" || ':' || module_row."module"),
    organization_row."id",
    module_row."module",
    true,
    NULL
  FROM "organization" AS organization_row
  CROSS JOIN (
    VALUES
      ('configurator'),
      ('crm'),
      ('quotes'),
      ('orders'),
      ('fulfillment'),
      ('pricing'),
      ('accounts')
  ) AS module_row("module")
  WHERE organization_row."organization_type" = 'dealer'
  ON CONFLICT ("organization_id", "module") DO NOTHING
  RETURNING "organization_id", "module"
)
INSERT INTO "authorization_audit_logs" (
  "id",
  "organization_id",
  "actor_user_id",
  "action",
  "before",
  "after"
)
SELECT
  md5('dealer-entitlement-audit:' || inserted_entitlements."organization_id"),
  inserted_entitlements."organization_id",
  NULL,
  'organization.entitlements.backfilled',
  '{"source":"pre-explicit-entitlements"}'::jsonb,
  jsonb_build_object(
    'modules', jsonb_agg(inserted_entitlements."module" ORDER BY inserted_entitlements."module"),
    'enabled', true
  )
FROM inserted_entitlements
GROUP BY inserted_entitlements."organization_id"
ON CONFLICT ("id") DO NOTHING;
