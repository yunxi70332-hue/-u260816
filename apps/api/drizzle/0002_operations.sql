CREATE TYPE "public"."organization_type" AS ENUM('hq', 'dealer');--> statement-breakpoint
CREATE TYPE "public"."dealer_level" AS ENUM('core', 'standard', 'watch');--> statement-breakpoint
CREATE TYPE "public"."dealer_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."account_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."price_list_status" AS ENUM('draft', 'active', 'expired');--> statement-breakpoint
CREATE TYPE "public"."shipment_status" AS ENUM('pending', 'shipped', 'delivered', 'cancelled');--> statement-breakpoint

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "username" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "display_username" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_username_unique" ON "user" USING btree ("username");--> statement-breakpoint

ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "organization_type" "organization_type" DEFAULT 'hq' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "parent_organization_id" text;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "organization" ADD CONSTRAINT "organization_parent_organization_id_fk" FOREIGN KEY ("parent_organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_parent_idx" ON "organization" USING btree ("parent_organization_id");--> statement-breakpoint

ALTER TABLE "member" ADD COLUMN IF NOT EXISTS "status" "account_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "dealer_organizations" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL,
  "organization_id" text NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "region" text NOT NULL,
  "contact" text NOT NULL,
  "email" text NOT NULL,
  "level" "dealer_level" DEFAULT 'standard' NOT NULL,
  "discount_rate" integer DEFAULT 90 NOT NULL,
  "status" "dealer_status" DEFAULT 'active' NOT NULL,
  "last_active_at" timestamp with time zone,
  "revision" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "dealer_organizations_discount_rate_range" CHECK ("discount_rate" between 0 and 100),
  CONSTRAINT "dealer_organizations_revision_positive" CHECK ("revision" > 0)
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "price_lists" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "market" text NOT NULL,
  "currency" text DEFAULT 'CNY' NOT NULL,
  "version" text NOT NULL,
  "item_count" integer DEFAULT 0 NOT NULL,
  "effective_from" date NOT NULL,
  "status" "price_list_status" DEFAULT 'draft' NOT NULL,
  "revision" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "price_lists_currency_length" CHECK (char_length("currency") = 3),
  CONSTRAINT "price_lists_item_count_nonnegative" CHECK ("item_count" >= 0),
  CONSTRAINT "price_lists_revision_positive" CHECK ("revision" > 0)
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "shipments" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL,
  "order_id" text NOT NULL,
  "shipment_no" text NOT NULL,
  "carrier" text NOT NULL,
  "tracking_no" text NOT NULL,
  "status" "shipment_status" DEFAULT 'pending' NOT NULL,
  "packages" integer NOT NULL,
  "shipped_at" timestamp with time zone,
  "signed_at" timestamp with time zone,
  "revision" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "shipments_packages_positive" CHECK ("packages" > 0),
  CONSTRAINT "shipments_revision_positive" CHECK ("revision" > 0)
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "attachments" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "file_name" text NOT NULL,
  "content_type" text NOT NULL,
  "size_bytes" bigint NOT NULL,
  "object_key" text NOT NULL,
  "upload_pending" boolean DEFAULT true NOT NULL,
  "created_by" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "revision" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "attachments_size_nonnegative" CHECK ("size_bytes" >= 0),
  CONSTRAINT "attachments_revision_positive" CHECK ("revision" > 0)
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "dealer_organizations" ADD CONSTRAINT "dealer_organizations_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "dealer_organizations" ADD CONSTRAINT "dealer_organizations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "shipments" ADD CONSTRAINT "shipments_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "shipments" ADD CONSTRAINT "shipments_tenant_order_fk" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "public"."orders"("tenant_id", "id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "attachments" ADD CONSTRAINT "attachments_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "attachments" ADD CONSTRAINT "attachments_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "dealer_organizations_tenant_id_id_unique" ON "dealer_organizations" USING btree ("tenant_id", "id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "dealer_organizations_organization_unique" ON "dealer_organizations" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "dealer_organizations_tenant_code_unique" ON "dealer_organizations" USING btree ("tenant_id", "code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dealer_organizations_tenant_status_idx" ON "dealer_organizations" USING btree ("tenant_id", "status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "price_lists_tenant_id_id_unique" ON "price_lists" USING btree ("tenant_id", "id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "price_lists_tenant_code_version_unique" ON "price_lists" USING btree ("tenant_id", "code", "version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "price_lists_tenant_status_idx" ON "price_lists" USING btree ("tenant_id", "status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shipments_tenant_id_id_unique" ON "shipments" USING btree ("tenant_id", "id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shipments_tenant_number_unique" ON "shipments" USING btree ("tenant_id", "shipment_no");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shipments_tenant_order_idx" ON "shipments" USING btree ("tenant_id", "order_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "attachments_tenant_id_id_unique" ON "attachments" USING btree ("tenant_id", "id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "attachments_tenant_object_key_unique" ON "attachments" USING btree ("tenant_id", "object_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attachments_tenant_entity_idx" ON "attachments" USING btree ("tenant_id", "entity_type", "entity_id");--> statement-breakpoint
