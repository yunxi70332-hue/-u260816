CREATE TYPE "public"."customer_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."design_status" AS ENUM('draft', 'review', 'approved', 'archived');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('draft', 'confirmed', 'technical_review', 'ready_for_production', 'in_production', 'ready_to_ship', 'shipped', 'delivered', 'completed', 'on_hold', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('lead', 'designing', 'quoted', 'won', 'lost', 'on_hold', 'closed');--> statement-breakpoint
CREATE TYPE "public"."quote_line_pricing_status" AS ENUM('priced', 'included', 'unmatched');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('draft', 'priced', 'submitted', 'changes_requested', 'approved', 'customer_confirmed', 'converted', 'sent', 'accepted', 'rejected', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."template_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"actor_user_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"request_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"company_name" text,
	"email" text,
	"phone" text,
	"address" text,
	"status" "customer_status" DEFAULT 'active' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_revision_positive" CHECK ("customers"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "design_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"design_id" text NOT NULL,
	"version" integer NOT NULL,
	"source_draft_revision" integer NOT NULL,
	"config_snapshot" jsonb NOT NULL,
	"bom_snapshot" jsonb NOT NULL,
	"pricing_snapshot" jsonb NOT NULL,
	"note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "design_versions_version_positive" CHECK ("design_versions"."version" > 0),
	CONSTRAINT "design_versions_source_revision_positive" CHECK ("design_versions"."source_draft_revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "designs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"code" text NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"template_version_id" text,
	"status" "design_status" DEFAULT 'draft' NOT NULL,
	"draft_revision" integer DEFAULT 1 NOT NULL,
	"config_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"bom_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pricing_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "designs_draft_revision_positive" CHECK ("designs"."draft_revision" > 0),
	CONSTRAINT "designs_revision_positive" CHECK ("designs"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"route" text NOT NULL,
	"request_hash" text NOT NULL,
	"status_code" integer NOT NULL,
	"response" jsonb NOT NULL,
	"resource_type" text,
	"resource_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"inviter_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"code" text NOT NULL,
	"project_id" text NOT NULL,
	"customer_id" text,
	"accepted_quote_id" text NOT NULL,
	"status" "order_status" DEFAULT 'draft' NOT NULL,
	"currency" text DEFAULT 'CNY' NOT NULL,
	"total_minor" bigint NOT NULL,
	"snapshot" jsonb NOT NULL,
	"production_note" text,
	"shipping_note" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_revision_positive" CHECK ("orders"."revision" > 0),
	CONSTRAINT "orders_currency_length" CHECK (char_length("orders"."currency") = 3),
	CONSTRAINT "orders_total_nonnegative" CHECK ("orders"."total_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" text,
	"plan" text DEFAULT 'standard' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"code" text NOT NULL,
	"customer_id" text,
	"name" text NOT NULL,
	"status" "project_status" DEFAULT 'lead' NOT NULL,
	"owner_user_id" text,
	"description" text,
	"target_date" date,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_revision_positive" CHECK ("projects"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "quote_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"quote_id" text NOT NULL,
	"position" integer NOT NULL,
	"source_ref" text NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"unit_price_minor" bigint NOT NULL,
	"line_total_minor" bigint NOT NULL,
	"pricing_status" "quote_line_pricing_status" NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quote_lines_position_nonnegative" CHECK ("quote_lines"."position" >= 0),
	CONSTRAINT "quote_lines_quantity_positive" CHECK ("quote_lines"."quantity" > 0),
	CONSTRAINT "quote_lines_unit_price_nonnegative" CHECK ("quote_lines"."unit_price_minor" >= 0),
	CONSTRAINT "quote_lines_total_nonnegative" CHECK ("quote_lines"."line_total_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"code" text NOT NULL,
	"project_id" text NOT NULL,
	"customer_id" text,
	"design_version_id" text NOT NULL,
	"status" "quote_status" DEFAULT 'draft' NOT NULL,
	"currency" text DEFAULT 'CNY' NOT NULL,
	"subtotal_minor" bigint DEFAULT 0 NOT NULL,
	"discount_minor" bigint DEFAULT 0 NOT NULL,
	"tax_rate_basis_points" integer DEFAULT 0 NOT NULL,
	"tax_minor" bigint DEFAULT 0 NOT NULL,
	"total_minor" bigint DEFAULT 0 NOT NULL,
	"valid_until" date,
	"notes" text,
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotes_revision_positive" CHECK ("quotes"."revision" > 0),
	CONSTRAINT "quotes_currency_length" CHECK (char_length("quotes"."currency") = 3),
	CONSTRAINT "quotes_subtotal_nonnegative" CHECK ("quotes"."subtotal_minor" >= 0),
	CONSTRAINT "quotes_discount_nonnegative" CHECK ("quotes"."discount_minor" >= 0),
	CONSTRAINT "quotes_tax_nonnegative" CHECK ("quotes"."tax_minor" >= 0),
	CONSTRAINT "quotes_total_nonnegative" CHECK ("quotes"."total_minor" >= 0),
	CONSTRAINT "quotes_tax_rate_range" CHECK ("quotes"."tax_rate_basis_points" between 0 and 10000)
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	"impersonated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"template_id" text NOT NULL,
	"version" integer NOT NULL,
	"name" text NOT NULL,
	"config_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"bom_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pricing_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "template_versions_version_positive" CHECK ("template_versions"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "template_status" DEFAULT 'draft' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "templates_revision_positive" CHECK ("templates"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'user' NOT NULL,
	"banned" boolean DEFAULT false NOT NULL,
	"ban_reason" text,
	"ban_expires" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "customers_tenant_id_id_unique" ON "customers" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "design_versions_tenant_id_id_unique" ON "design_versions" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "designs_tenant_id_id_unique" ON "designs" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_tenant_id_id_unique" ON "orders" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_tenant_id_id_unique" ON "projects" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "quote_lines_tenant_id_id_unique" ON "quote_lines" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_tenant_id_id_unique" ON "quotes" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "template_versions_tenant_id_id_unique" ON "template_versions" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "templates_tenant_id_id_unique" ON "templates" USING btree ("tenant_id","id");--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_versions" ADD CONSTRAINT "design_versions_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_versions" ADD CONSTRAINT "design_versions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_versions" ADD CONSTRAINT "design_versions_tenant_design_fk" FOREIGN KEY ("tenant_id","design_id") REFERENCES "public"."designs"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designs" ADD CONSTRAINT "designs_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designs" ADD CONSTRAINT "designs_tenant_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designs" ADD CONSTRAINT "designs_tenant_template_version_fk" FOREIGN KEY ("tenant_id","template_version_id") REFERENCES "public"."template_versions"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_customer_fk" FOREIGN KEY ("tenant_id","customer_id") REFERENCES "public"."customers"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_accepted_quote_fk" FOREIGN KEY ("tenant_id","accepted_quote_id") REFERENCES "public"."quotes"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_tenant_customer_fk" FOREIGN KEY ("tenant_id","customer_id") REFERENCES "public"."customers"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_tenant_quote_fk" FOREIGN KEY ("tenant_id","quote_id") REFERENCES "public"."quotes"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_tenant_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_tenant_customer_fk" FOREIGN KEY ("tenant_id","customer_id") REFERENCES "public"."customers"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_tenant_design_version_fk" FOREIGN KEY ("tenant_id","design_version_id") REFERENCES "public"."design_versions"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_active_organization_id_organization_id_fk" FOREIGN KEY ("active_organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_impersonated_by_user_id_fk" FOREIGN KEY ("impersonated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_tenant_template_fk" FOREIGN KEY ("tenant_id","template_id") REFERENCES "public"."templates"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_account_unique" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_tenant_created_at_idx" ON "audit_logs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_tenant_entity_idx" ON "audit_logs" USING btree ("tenant_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_tenant_actor_idx" ON "audit_logs" USING btree ("tenant_id","actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_request_id_idx" ON "audit_logs" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_tenant_code_unique" ON "customers" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "customers_tenant_name_idx" ON "customers" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "customers_tenant_status_idx" ON "customers" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "design_versions_tenant_design_version_unique" ON "design_versions" USING btree ("tenant_id","design_id","version");--> statement-breakpoint
CREATE INDEX "design_versions_tenant_created_at_idx" ON "design_versions" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "designs_tenant_code_unique" ON "designs" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "designs_tenant_project_idx" ON "designs" USING btree ("tenant_id","project_id");--> statement-breakpoint
CREATE INDEX "designs_tenant_status_idx" ON "designs" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_tenant_route_key_unique" ON "idempotency_keys" USING btree ("tenant_id","route","idempotency_key");--> statement-breakpoint
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "invitation_organization_id_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "invitation_expires_at_idx" ON "invitation" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "member_organization_user_unique" ON "member" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "member_user_id_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_tenant_code_unique" ON "orders" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_tenant_accepted_quote_unique" ON "orders" USING btree ("tenant_id","accepted_quote_id");--> statement-breakpoint
CREATE INDEX "orders_tenant_project_idx" ON "orders" USING btree ("tenant_id","project_id");--> statement-breakpoint
CREATE INDEX "orders_tenant_status_idx" ON "orders" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_slug_unique" ON "organization" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_tenant_code_unique" ON "projects" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "projects_tenant_status_idx" ON "projects" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "projects_tenant_customer_idx" ON "projects" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE INDEX "projects_tenant_updated_at_idx" ON "projects" USING btree ("tenant_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "quote_lines_tenant_quote_position_unique" ON "quote_lines" USING btree ("tenant_id","quote_id","position");--> statement-breakpoint
CREATE INDEX "quote_lines_tenant_quote_idx" ON "quote_lines" USING btree ("tenant_id","quote_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_tenant_code_unique" ON "quotes" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "quotes_tenant_project_idx" ON "quotes" USING btree ("tenant_id","project_id");--> statement-breakpoint
CREATE INDEX "quotes_tenant_status_idx" ON "quotes" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "quotes_tenant_customer_idx" ON "quotes" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_unique" ON "session" USING btree ("token");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_active_organization_id_idx" ON "session" USING btree ("active_organization_id");--> statement-breakpoint
CREATE INDEX "session_expires_at_idx" ON "session" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "template_versions_tenant_template_version_unique" ON "template_versions" USING btree ("tenant_id","template_id","version");--> statement-breakpoint
CREATE INDEX "template_versions_tenant_published_at_idx" ON "template_versions" USING btree ("tenant_id","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "templates_tenant_code_unique" ON "templates" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "templates_tenant_status_idx" ON "templates" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_unique" ON "user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "verification_expires_at_idx" ON "verification" USING btree ("expires_at");--> statement-breakpoint
CREATE FUNCTION "set_updated_at"() RETURNS trigger AS $$
BEGIN
	NEW.updated_at = now();
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "user_set_updated_at" BEFORE UPDATE ON "user" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
CREATE TRIGGER "organization_set_updated_at" BEFORE UPDATE ON "organization" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
CREATE TRIGGER "session_set_updated_at" BEFORE UPDATE ON "session" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
CREATE TRIGGER "account_set_updated_at" BEFORE UPDATE ON "account" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
CREATE TRIGGER "verification_set_updated_at" BEFORE UPDATE ON "verification" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
CREATE TRIGGER "member_set_updated_at" BEFORE UPDATE ON "member" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
CREATE TRIGGER "customers_set_updated_at" BEFORE UPDATE ON "customers" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
CREATE TRIGGER "projects_set_updated_at" BEFORE UPDATE ON "projects" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
CREATE TRIGGER "templates_set_updated_at" BEFORE UPDATE ON "templates" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
CREATE TRIGGER "designs_set_updated_at" BEFORE UPDATE ON "designs" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
CREATE TRIGGER "quotes_set_updated_at" BEFORE UPDATE ON "quotes" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
CREATE TRIGGER "orders_set_updated_at" BEFORE UPDATE ON "orders" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
CREATE TRIGGER "idempotency_keys_set_updated_at" BEFORE UPDATE ON "idempotency_keys" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
