ALTER TABLE "quotes"
  ADD COLUMN IF NOT EXISTS "base_price_total_minor" bigint,
  ADD COLUMN IF NOT EXISTS "sales_multiplier_basis_points" integer,
  ADD COLUMN IF NOT EXISTS "multiplier_quote_total_minor" bigint;

ALTER TABLE "quotes"
  DROP CONSTRAINT IF EXISTS "quotes_sales_multiplier_basis_points_range";

ALTER TABLE "quotes"
  ADD CONSTRAINT "quotes_sales_multiplier_basis_points_range"
  CHECK (
    "sales_multiplier_basis_points" IS NULL
    OR ("sales_multiplier_basis_points" >= 10000 AND "sales_multiplier_basis_points" <= 99900)
  );

INSERT INTO "member_permission_grants" (
  "id", "organization_id", "member_id", "permission", "scope", "assigned_user_ids"
)
SELECT
  md5(random()::text || clock_timestamp()::text || member.id),
  member.organization_id,
  member.id,
  permission_name,
  'organization',
  '[]'::jsonb
FROM "member" AS member
JOIN "organization" AS organization ON organization.id = member.organization_id
CROSS JOIN (VALUES ('quotes.multiplier.view'), ('quotes.multiplier.manage'), ('prices.retail.view')) AS permissions(permission_name)
WHERE organization.organization_type = 'hq'
  AND member.status = 'active'
  AND member.role IN ('owner', 'admin', 'sales', 'headquarters_admin', 'headquarters_sales')
ON CONFLICT ("member_id", "permission") DO NOTHING;

INSERT INTO "member_permission_grants" (
  "id", "organization_id", "member_id", "permission", "scope", "assigned_user_ids"
)
SELECT
  md5(random()::text || clock_timestamp()::text || member.id),
  member.organization_id,
  member.id,
  'quotes.multiplier.view',
  'organization',
  '[]'::jsonb
FROM "member" AS member
JOIN "organization" AS organization ON organization.id = member.organization_id
WHERE organization.organization_type = 'hq'
  AND member.status = 'active'
  AND member.role = 'finance'
ON CONFLICT ("member_id", "permission") DO NOTHING;
