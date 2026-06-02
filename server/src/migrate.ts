import { pool } from './db'

const MIGRATION = `
CREATE TABLE IF NOT EXISTS promotions (
  id             SERIAL PRIMARY KEY,
  agent_id       UUID          NOT NULL REFERENCES agents(id),
  name           VARCHAR(100)  NOT NULL,
  type           VARCHAR(20)   NOT NULL CHECK (type IN ('voucher','time_slot','event')),
  is_active      BOOLEAN       DEFAULT TRUE,
  discount_type  VARCHAR(10)   NOT NULL CHECK (discount_type IN ('percent','fixed')),
  discount_value DECIMAL(10,2) NOT NULL,
  apply_to       VARCHAR(20)   DEFAULT 'total' CHECK (apply_to IN ('total','play','items')),
  max_discount   DECIMAL(10,0) NULL,
  code           VARCHAR(50)   NULL,
  max_uses       INT           NULL,
  used_count     INT           DEFAULT 0,
  days_of_week   INT[]         NULL,
  time_from      TIME          NULL,
  time_to        TIME          NULL,
  valid_from     DATE          NULL,
  valid_to       DATE          NULL,
  created_at     TIMESTAMPTZ   DEFAULT NOW(),
  CONSTRAINT voucher_has_code CHECK (type <> 'voucher' OR code IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS promotions_code_agent_idx
  ON promotions (agent_id, code) WHERE code IS NOT NULL;

CREATE TABLE IF NOT EXISTS cloud_staff (
  id              SERIAL PRIMARY KEY,
  agent_id        UUID         NOT NULL REFERENCES agents(id),
  username        VARCHAR(50)  NOT NULL,
  password_hash   VARCHAR(100) NOT NULL,
  allowed_screens TEXT[]       NOT NULL DEFAULT '{}',
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ  DEFAULT NOW(),
  CONSTRAINT uq_cloud_staff_username UNIQUE (username, agent_id)
);

CREATE TABLE IF NOT EXISTS invoice_edit_requests (
  id              SERIAL PRIMARY KEY,
  agent_id        UUID          NOT NULL REFERENCES agents(id),
  invoice_id      INT           NOT NULL,
  session_id      INT           NOT NULL,
  requested_by    VARCHAR(100)  NOT NULL,
  status          VARCHAR(20)   NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected')),
  old_items       JSONB         NOT NULL,
  new_items       JSONB         NOT NULL,
  note            TEXT,
  reviewed_by     VARCHAR(100),
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_edit_requests_agent_status
  ON invoice_edit_requests (agent_id, status, created_at DESC);
`

export async function runMigrations() {
  try {
    await pool.query(MIGRATION)
    console.log('✓ Migrations applied')
  } catch (err) {
    console.error('Migration error (non-fatal):', err)
  }
}
