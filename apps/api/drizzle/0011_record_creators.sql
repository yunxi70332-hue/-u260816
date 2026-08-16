ALTER TABLE "customers" ADD COLUMN "created_by_user_id" text;
ALTER TABLE "projects" ADD COLUMN "created_by_user_id" text;
ALTER TABLE "designs" ADD COLUMN "created_by_user_id" text;
ALTER TABLE "quotes" ADD COLUMN "created_by_user_id" text;
ALTER TABLE "orders" ADD COLUMN "created_by_user_id" text;

ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "designs" ADD CONSTRAINT "designs_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;

UPDATE "projects" SET "created_by_user_id" = "owner_user_id" WHERE "created_by_user_id" IS NULL;
UPDATE "customers" AS customer SET "created_by_user_id" = source."owner_user_id"
FROM (
  SELECT DISTINCT ON ("tenant_id", "customer_id") "tenant_id", "customer_id", "owner_user_id"
  FROM "projects"
  WHERE "customer_id" IS NOT NULL AND "owner_user_id" IS NOT NULL
  ORDER BY "tenant_id", "customer_id", "created_at" ASC
) AS source
WHERE customer."tenant_id" = source."tenant_id" AND customer."id" = source."customer_id" AND customer."created_by_user_id" IS NULL;
UPDATE "designs" AS design SET "created_by_user_id" = project."created_by_user_id"
FROM "projects" AS project
WHERE design."tenant_id" = project."tenant_id" AND design."project_id" = project."id" AND design."created_by_user_id" IS NULL;
UPDATE "quotes" AS quote SET "created_by_user_id" = project."created_by_user_id"
FROM "projects" AS project
WHERE quote."tenant_id" = project."tenant_id" AND quote."project_id" = project."id" AND quote."created_by_user_id" IS NULL;
UPDATE "orders" SET "created_by_user_id" = "owner_user_id" WHERE "created_by_user_id" IS NULL;

CREATE INDEX "customers_tenant_created_by_idx" ON "customers" USING btree ("tenant_id", "created_by_user_id");
CREATE INDEX "projects_tenant_created_by_idx" ON "projects" USING btree ("tenant_id", "created_by_user_id");
CREATE INDEX "designs_tenant_created_by_idx" ON "designs" USING btree ("tenant_id", "created_by_user_id");
CREATE INDEX "quotes_tenant_created_by_idx" ON "quotes" USING btree ("tenant_id", "created_by_user_id");
CREATE INDEX "orders_tenant_created_by_idx" ON "orders" USING btree ("tenant_id", "created_by_user_id");
