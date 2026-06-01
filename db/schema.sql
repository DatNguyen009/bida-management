-- db/schema.sql

CREATE TABLE IF NOT EXISTS tables (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'idle',
  hourly_rate DECIMAL(10,0) NOT NULL DEFAULT 50000,
  agent_id UUID NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  email VARCHAR(100) NULL,
  total_visits INT DEFAULT 0,
  total_spent DECIMAL(12,0) DEFAULT 0,
  points_balance INT DEFAULT 0,
  notes TEXT NULL,
  agent_id UUID NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  table_id INT NOT NULL REFERENCES tables(id),
  customer_id INT NULL REFERENCES customers(id),
  start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time TIMESTAMPTZ NULL,
  duration_minutes INT NULL,
  play_amount DECIMAL(10,0) DEFAULT 0,
  agent_id UUID NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open'
);

CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  icon VARCHAR(10) NOT NULL DEFAULT '📦',
  agent_id UUID NULL,
  CONSTRAINT uq_category_name UNIQUE (name, agent_id)
);

CREATE TABLE IF NOT EXISTS staff (
  id SERIAL PRIMARY KEY,
  agent_id UUID NOT NULL,
  username VARCHAR(50) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  allowed_screens TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_staff_username UNIQUE (username, agent_id)
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  price DECIMAL(10,0) NOT NULL,
  cost_price DECIMAL(10,0) NULL,
  stock_quantity INT NOT NULL DEFAULT 0,
  min_stock_alert INT NOT NULL DEFAULT 5,
  unit VARCHAR(20) NOT NULL DEFAULT 'cái',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  category_id INT NULL,
  product_type VARCHAR(20) NOT NULL DEFAULT 'stock',
  agent_id UUID NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  session_id INT NOT NULL REFERENCES sessions(id),
  product_id INT NOT NULL REFERENCES products(id),
  quantity INT NOT NULL,
  unit_price DECIMAL(10,0) NOT NULL,
  subtotal DECIMAL(10,0) NOT NULL,
  agent_id UUID NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_order_items_session_product_agent UNIQUE (session_id, product_id, agent_id)
);

CREATE TABLE IF NOT EXISTS product_recipes (
  id SERIAL PRIMARY KEY,
  product_id INT NOT NULL,
  ingredient_id INT NOT NULL,
  quantity DECIMAL(10,2) NOT NULL,
  agent_id UUID NULL,
  CONSTRAINT uq_recipe UNIQUE (product_id, ingredient_id, agent_id)
);

CREATE TABLE IF NOT EXISTS loyalty_settings (
  id SERIAL PRIMARY KEY,
  points_per_10k_vnd INT NOT NULL DEFAULT 1,
  vnd_per_point INT NOT NULL DEFAULT 100,
  min_redeem_points INT NOT NULL DEFAULT 100,
  agent_id UUID NULL
);

CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  session_id INT NOT NULL REFERENCES sessions(id),
  invoice_number VARCHAR(20) UNIQUE NOT NULL,
  play_amount DECIMAL(10,0) NOT NULL DEFAULT 0,
  items_amount DECIMAL(10,0) NOT NULL DEFAULT 0,
  total_amount DECIMAL(10,0) NOT NULL DEFAULT 0,
  discount DECIMAL(10,0) NOT NULL DEFAULT 0,
  points_redeemed INT NOT NULL DEFAULT 0,
  discount_from_points DECIMAL(10,0) NOT NULL DEFAULT 0,
  final_amount DECIMAL(10,0) NOT NULL,
  points_earned INT NOT NULL DEFAULT 0,
  payment_method VARCHAR(20) NOT NULL DEFAULT 'cash',
  printed_at TIMESTAMPTZ NULL,
  agent_id UUID NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_transactions (
  id SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id),
  type VARCHAR(10) NOT NULL,
  quantity INT NOT NULL,
  cost_price NUMERIC(12,0) NULL,
  before_qty INT NOT NULL DEFAULT 0,
  after_qty INT NOT NULL DEFAULT 0,
  note TEXT NULL,
  agent_id UUID NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT,
  agent_id UUID NULL
);

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

-- Seed default data
INSERT INTO settings (key, value) VALUES
  ('shop_name', 'Quán Bida'),
  ('address', '123 Đường ABC, TP.HCM'),
  ('phone', '0901234567'),
  ('default_hourly_rate', '50000')
ON CONFLICT (key) DO NOTHING;

INSERT INTO loyalty_settings (points_per_10k_vnd, vnd_per_point, min_redeem_points)
SELECT 1, 100, 100
WHERE NOT EXISTS (SELECT 1 FROM loyalty_settings);

-- Chương trình khuyến mãi
CREATE TABLE IF NOT EXISTS promotions (
  id             SERIAL PRIMARY KEY,
  agent_id       VARCHAR(50) NOT NULL,
  name           VARCHAR(100) NOT NULL,
  type           VARCHAR(20) NOT NULL CHECK (type IN ('voucher','time_slot','event')),
  is_active      BOOLEAN DEFAULT TRUE,
  discount_type  VARCHAR(10) NOT NULL CHECK (discount_type IN ('percent','fixed')),
  discount_value DECIMAL(10,2) NOT NULL,
  apply_to       VARCHAR(20) DEFAULT 'total' CHECK (apply_to IN ('total','play','items')),
  max_discount   DECIMAL(10,0) NULL,
  code           VARCHAR(50) NULL,
  max_uses       INT NULL,
  used_count     INT DEFAULT 0,
  days_of_week   INT[] NULL,
  time_from      TIME NULL,
  time_to        TIME NULL,
  valid_from     DATE NULL,
  valid_to       DATE NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT voucher_has_code CHECK (type <> 'voucher' OR code IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS promotions_code_agent_idx
  ON promotions (agent_id, code) WHERE code IS NOT NULL;

-- Seed 8 sample tables
INSERT INTO tables (name, hourly_rate) VALUES
  ('Bàn 1', 50000), ('Bàn 2', 50000), ('Bàn 3', 50000), ('Bàn 4', 50000),
  ('Bàn 5', 60000), ('Bàn 6', 60000), ('Bàn 7', 70000), ('Bàn 8', 70000)
ON CONFLICT DO NOTHING;
