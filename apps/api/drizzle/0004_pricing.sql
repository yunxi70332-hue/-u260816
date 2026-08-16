ALTER TYPE "public"."price_list_status" ADD VALUE IF NOT EXISTS 'archived';--> statement-breakpoint
CREATE TYPE "public"."price_item_category" AS ENUM('frame', 'panel', 'door', 'interior', 'glass', 'hardware');--> statement-breakpoint
CREATE TYPE "public"."pricing_method" AS ENUM('fixed', 'area', 'length', 'formula', 'included', 'composite');--> statement-breakpoint
ALTER TABLE "dealer_organizations" ADD COLUMN "settlement_rate_percent" integer DEFAULT 90 NOT NULL;--> statement-breakpoint
UPDATE "dealer_organizations" SET "settlement_rate_percent" = "discount_rate";--> statement-breakpoint
ALTER TABLE "dealer_organizations" ADD CONSTRAINT "dealer_organizations_settlement_rate_range" CHECK ("dealer_organizations"."settlement_rate_percent" between 0 and 100);--> statement-breakpoint
ALTER TABLE "price_lists" ADD COLUMN "effective_to" date;--> statement-breakpoint
ALTER TABLE "price_lists" ADD COLUMN "published_by" text;--> statement-breakpoint
ALTER TABLE "price_lists" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_published_by_user_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "price_list_items" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"price_list_id" text NOT NULL,
	"material_key" text NOT NULL,
	"spec_key" text NOT NULL,
	"category" "price_item_category" NOT NULL,
	"name" text NOT NULL,
	"specification" text DEFAULT '' NOT NULL,
	"unit" text NOT NULL,
	"pricing_method" "pricing_method" DEFAULT 'fixed' NOT NULL,
	"retail_unit_price_minor" bigint,
	"pricing_rule" jsonb,
	"note" text DEFAULT '' NOT NULL,
	"source_ref" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_list_items_revision_positive" CHECK ("price_list_items"."revision" > 0),
	CONSTRAINT "price_list_items_price_nonnegative" CHECK ("price_list_items"."retail_unit_price_minor" is null or "price_list_items"."retail_unit_price_minor" >= 0)
);--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_tenant_price_list_fk" FOREIGN KEY ("tenant_id","price_list_id") REFERENCES "public"."price_lists"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "price_list_items_tenant_id_id_unique" ON "price_list_items" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "price_list_items_list_material_spec_unique" ON "price_list_items" USING btree ("tenant_id","price_list_id","material_key","spec_key");--> statement-breakpoint
CREATE INDEX "price_list_items_tenant_list_idx" ON "price_list_items" USING btree ("tenant_id","price_list_id");--> statement-breakpoint
CREATE INDEX "price_list_items_material_spec_idx" ON "price_list_items" USING btree ("material_key","spec_key");
