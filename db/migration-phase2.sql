-- db/migration-phase2.sql
-- Phase 2: Add agent_id to 9 local tables (nullable to preserve existing data)
ALTER TABLE tables             ADD COLUMN IF NOT EXISTS agent_id UUID;
ALTER TABLE sessions           ADD COLUMN IF NOT EXISTS agent_id UUID;
ALTER TABLE customers          ADD COLUMN IF NOT EXISTS agent_id UUID;
ALTER TABLE products           ADD COLUMN IF NOT EXISTS agent_id UUID;
ALTER TABLE order_items        ADD COLUMN IF NOT EXISTS agent_id UUID;
ALTER TABLE invoices           ADD COLUMN IF NOT EXISTS agent_id UUID;
ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS agent_id UUID;
ALTER TABLE loyalty_settings   ADD COLUMN IF NOT EXISTS agent_id UUID;
ALTER TABLE settings           ADD COLUMN IF NOT EXISTS agent_id UUID;

-- Sync queue: tracks all writes that need to be pushed to cloud
CREATE TABLE IF NOT EXISTS sync_queue (
  id          SERIAL       PRIMARY KEY,
  table_name  VARCHAR(50)  NOT NULL,
  row_id      TEXT         NOT NULL,
  operation   VARCHAR(10)  NOT NULL,  -- insert | update | delete
  payload     JSONB        NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  synced_at   TIMESTAMPTZ  NULL,
  retry_count INT          NOT NULL DEFAULT 0,
  last_error  TEXT         NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_pending
  ON sync_queue (id) WHERE synced_at IS NULL;
