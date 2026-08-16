ALTER TABLE "orders" ADD COLUMN "customer_confirmed_at" timestamp with time zone;
ALTER TABLE "orders" ADD COLUMN "delivery_lead_time_days" integer NOT NULL DEFAULT 30;
ALTER TABLE "orders" ADD COLUMN "expected_delivery_date" date;

UPDATE "orders"
SET
  "customer_confirmed_at" = COALESCE(
    NULLIF("snapshot" #>> '{quote,updatedAt}', '')::timestamptz,
    NULLIF("snapshot" ->> 'acceptedAt', '')::timestamptz,
    "created_at"
  ),
  "expected_delivery_date" = (
    (
      COALESCE(
        NULLIF("snapshot" #>> '{quote,updatedAt}', '')::timestamptz,
        NULLIF("snapshot" ->> 'acceptedAt', '')::timestamptz,
        "created_at"
      ) AT TIME ZONE 'Asia/Shanghai'
    )::date + "delivery_lead_time_days"
  )
WHERE "expected_delivery_date" IS NULL;
