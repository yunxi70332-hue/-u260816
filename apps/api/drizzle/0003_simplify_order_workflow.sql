UPDATE "orders"
SET "status" = CASE
  WHEN "status" = 'technical_review' THEN 'confirmed'::"order_status"
  WHEN "status" IN ('delivered', 'completed') THEN 'shipped'::"order_status"
  ELSE "status"
END,
"revision" = "revision" + 1,
"updated_at" = now()
WHERE "status" IN ('technical_review', 'delivered', 'completed');
