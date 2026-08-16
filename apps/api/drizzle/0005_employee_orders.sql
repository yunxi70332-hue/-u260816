ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "owner_user_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "assigned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "assigned_by_user_id" text;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "orders_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "orders_assigned_by_user_id_user_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_tenant_owner_idx" ON "orders" USING btree ("tenant_id", "owner_user_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "order_assignments" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL,
  "order_id" text NOT NULL,
  "previous_owner_user_id" text,
  "owner_user_id" text,
  "assigned_by_user_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_tenant_order_fk" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "public"."orders"("tenant_id", "id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_previous_owner_user_id_user_id_fk" FOREIGN KEY ("previous_owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_assigned_by_user_id_user_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "order_assignments_tenant_id_id_unique" ON "order_assignments" USING btree ("tenant_id", "id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_assignments_tenant_order_idx" ON "order_assignments" USING btree ("tenant_id", "order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_assignments_tenant_owner_idx" ON "order_assignments" USING btree ("tenant_id", "owner_user_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "order_follow_ups" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL,
  "order_id" text NOT NULL,
  "author_user_id" text NOT NULL,
  "content" text NOT NULL,
  "next_follow_up_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "order_follow_ups" ADD CONSTRAINT "order_follow_ups_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "order_follow_ups" ADD CONSTRAINT "order_follow_ups_tenant_order_fk" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "public"."orders"("tenant_id", "id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "order_follow_ups" ADD CONSTRAINT "order_follow_ups_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "order_follow_ups_tenant_id_id_unique" ON "order_follow_ups" USING btree ("tenant_id", "id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_follow_ups_tenant_order_idx" ON "order_follow_ups" USING btree ("tenant_id", "order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_follow_ups_tenant_author_idx" ON "order_follow_ups" USING btree ("tenant_id", "author_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_follow_ups_tenant_next_follow_up_idx" ON "order_follow_ups" USING btree ("tenant_id", "next_follow_up_at");--> statement-breakpoint
