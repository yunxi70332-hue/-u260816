ALTER TABLE "quotes"
  DROP CONSTRAINT IF EXISTS "quotes_sales_multiplier_basis_points_range";

ALTER TABLE "quotes"
  ADD CONSTRAINT "quotes_sales_multiplier_basis_points_range"
  CHECK (
    "sales_multiplier_basis_points" IS NULL
    OR ("sales_multiplier_basis_points" >= 5000 AND "sales_multiplier_basis_points" <= 99900)
  );

ALTER TABLE "sales_pricing_preferences"
  DROP CONSTRAINT IF EXISTS "sales_pricing_preferences_multiplier_range";

ALTER TABLE "sales_pricing_preferences"
  ADD CONSTRAINT "sales_pricing_preferences_multiplier_range"
  CHECK ("sales_multiplier_basis_points" >= 5000 AND "sales_multiplier_basis_points" <= 99900);

ALTER TABLE "sales_pricing_preferences"
  ALTER COLUMN "sales_multiplier_basis_points" SET DEFAULT 10000;
