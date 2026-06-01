-- Migration: add completed_by and customer_id to cloud_invoices
ALTER TABLE cloud_invoices
  ADD COLUMN IF NOT EXISTS completed_by VARCHAR(50) NULL;

ALTER TABLE cloud_invoices
  ADD COLUMN IF NOT EXISTS customer_id INTEGER NULL;

-- Backfill customer_id from sessions (for invoices where session had customer set at creation)
UPDATE cloud_invoices i
SET customer_id = s.customer_id
FROM cloud_sessions s
WHERE i.session_id = s.id
  AND s.customer_id IS NOT NULL
  AND i.customer_id IS NULL;
