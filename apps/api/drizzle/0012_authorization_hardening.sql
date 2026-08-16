ALTER TABLE "organization_entitlements" ALTER COLUMN "enabled" SET DEFAULT false;

DELETE FROM "member_permission_grants" grant_row
WHERE NOT EXISTS (
  SELECT 1 FROM "member" member_row
  WHERE member_row."id" = grant_row."member_id"
    AND member_row."organization_id" = grant_row."organization_id"
);

DELETE FROM "member_data_scopes" scope_row
WHERE NOT EXISTS (
  SELECT 1 FROM "member" member_row
  WHERE member_row."id" = scope_row."member_id"
    AND member_row."organization_id" = scope_row."organization_id"
);

CREATE UNIQUE INDEX IF NOT EXISTS "member_id_organization_unique"
  ON "member" ("id", "organization_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'member_permission_grants_member_organization_fk'
  ) THEN
    ALTER TABLE "member_permission_grants"
      ADD CONSTRAINT "member_permission_grants_member_organization_fk"
      FOREIGN KEY ("member_id", "organization_id")
      REFERENCES "member" ("id", "organization_id")
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'member_data_scopes_member_organization_fk'
  ) THEN
    ALTER TABLE "member_data_scopes"
      ADD CONSTRAINT "member_data_scopes_member_organization_fk"
      FOREIGN KEY ("member_id", "organization_id")
      REFERENCES "member" ("id", "organization_id")
      ON DELETE CASCADE;
  END IF;
END $$;
