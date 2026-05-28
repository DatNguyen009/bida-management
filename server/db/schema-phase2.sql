-- server/db/schema-phase2.sql
-- Mirror 9 bảng local trên cloud PostgreSQL
-- PK: (agent_id, id) composite — trừ cloud_settings dùng (agent_id, key)

CREATE TABLE IF NOT EXISTS cloud_tables (
  agent_id    UUID          NOT NULL REFERENCES agents(id),
  id          INT           NOT NULL,
  name        VARCHAR(50)   NOT NULL,
  status      VARCHAR(20)   NOT NULL DEFAULT 'idle',
  hourly_rate DECIMAL(10,0) NOT NULL,
  created_at  TIMESTAMPTZ,
  PRIMARY KEY (agent_id, id)
);

CREATE TABLE IF NOT EXISTS cloud_customers (
  agent_id       UUID          NOT NULL REFERENCES agents(id),
  id             INT           NOT NULL,
  name           VARCHAR(100)  NOT NULL,
  phone          VARCHAR(20)   NOT NULL,
  email          VARCHAR(100),
  total_visits   INT           DEFAULT 0,
  total_spent    DECIMAL(12,0) DEFAULT 0,
  points_balance INT           DEFAULT 0,
  notes          TEXT,
  created_at     TIMESTAMPTZ,
  PRIMARY KEY (agent_id, id)
);

CREATE TABLE IF NOT EXISTS cloud_sessions (
  agent_id         UUID          NOT NULL REFERENCES agents(id),
  id               INT           NOT NULL,
  table_id         INT           NOT NULL,
  customer_id      INT,
  start_time       TIMESTAMPTZ   NOT NULL,
  end_time         TIMESTAMPTZ,
  duration_minutes INT,
  play_amount      DECIMAL(10,0) DEFAULT 0,
  status           VARCHAR(20)   NOT NULL DEFAULT 'open',
  PRIMARY KEY (agent_id, id)
);

CREATE TABLE IF NOT EXISTS cloud_products (
  agent_id        UUID          NOT NULL REFERENCES agents(id),
  id              INT           NOT NULL,
  name            VARCHAR(100)  NOT NULL,
  category        VARCHAR(50)   NOT NULL,
  price           DECIMAL(10,0) NOT NULL,
  stock_quantity  INT           NOT NULL DEFAULT 0,
  min_stock_alert INT           NOT NULL DEFAULT 5,
  unit            VARCHAR(20)   NOT NULL DEFAULT 'cái',
  is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ,
  PRIMARY KEY (agent_id, id)
);

CREATE TABLE IF NOT EXISTS cloud_order_items (
  agent_id   UUID          NOT NULL REFERENCES agents(id),
  id         INT           NOT NULL,
  session_id INT           NOT NULL,
  product_id INT           NOT NULL,
  quantity   INT           NOT NULL,
  unit_price DECIMAL(10,0) NOT NULL,
  subtotal   DECIMAL(10,0) NOT NULL,
  created_at TIMESTAMPTZ,
  PRIMARY KEY (agent_id, id)
);

CREATE TABLE IF NOT EXISTS cloud_invoices (
  agent_id             UUID          NOT NULL REFERENCES agents(id),
  id                   INT           NOT NULL,
  session_id           INT           NOT NULL,
  invoice_number       VARCHAR(20)   NOT NULL,
  play_amount          DECIMAL(10,0) NOT NULL DEFAULT 0,
  items_amount         DECIMAL(10,0) NOT NULL DEFAULT 0,
  total_amount         DECIMAL(10,0) NOT NULL DEFAULT 0,
  discount             DECIMAL(10,0) NOT NULL DEFAULT 0,
  points_redeemed      INT           NOT NULL DEFAULT 0,
  discount_from_points DECIMAL(10,0) NOT NULL DEFAULT 0,
  final_amount         DECIMAL(10,0) NOT NULL,
  points_earned        INT           NOT NULL DEFAULT 0,
  printed_at           TIMESTAMPTZ,
  created_at           TIMESTAMPTZ,
  PRIMARY KEY (agent_id, id)
);

CREATE TABLE IF NOT EXISTS cloud_stock_transactions (
  agent_id   UUID          NOT NULL REFERENCES agents(id),
  id         INT           NOT NULL,
  product_id INT           NOT NULL,
  type       VARCHAR(10)   NOT NULL,
  quantity   INT           NOT NULL,
  cost_price NUMERIC(12,0),
  before_qty INT           NOT NULL DEFAULT 0,
  after_qty  INT           NOT NULL DEFAULT 0,
  note       TEXT,
  created_at TIMESTAMPTZ,
  PRIMARY KEY (agent_id, id)
);

CREATE TABLE IF NOT EXISTS cloud_loyalty_settings (
  agent_id           UUID NOT NULL REFERENCES agents(id),
  id                 INT  NOT NULL,
  points_per_10k_vnd INT  NOT NULL DEFAULT 1,
  vnd_per_point      INT  NOT NULL DEFAULT 100,
  min_redeem_points  INT  NOT NULL DEFAULT 100,
  PRIMARY KEY (agent_id, id)
);

-- settings uses (agent_id, key) because key is PK in local DB
CREATE TABLE IF NOT EXISTS cloud_settings (
  agent_id UUID         NOT NULL REFERENCES agents(id),
  key      VARCHAR(100) NOT NULL,
  value    TEXT,
  PRIMARY KEY (agent_id, key)
);
