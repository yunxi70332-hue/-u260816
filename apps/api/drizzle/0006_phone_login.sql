ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "phone_number" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "phone_number_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_phone_number_unique" ON "user" USING btree ("phone_number");--> statement-breakpoint
ALTER TABLE "dealer_organizations" ADD COLUMN IF NOT EXISTS "phone" text;--> statement-breakpoint
ALTER TABLE "dealer_organizations" ALTER COLUMN "email" DROP NOT NULL;
