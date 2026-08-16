CREATE TABLE IF NOT EXISTS "sales_pricing_preferences" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "sales_multiplier_basis_points" integer NOT NULL DEFAULT 15000,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "sales_pricing_preferences_multiplier_range"
    CHECK ("sales_multiplier_basis_points" >= 10000 AND "sales_multiplier_basis_points" <= 99900)
);

CREATE UNIQUE INDEX IF NOT EXISTS "sales_pricing_preferences_org_user_unique"
  ON "sales_pricing_preferences" ("organization_id", "user_id");

CREATE INDEX IF NOT EXISTS "sales_pricing_preferences_user_idx"
  ON "sales_pricing_preferences" ("user_id");
