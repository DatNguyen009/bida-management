-- db/schema.sql

CREATE TABLE IF NOT EXISTS tables (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'idle',
  hourly_rate DECIMAL(10,0) NOT NULL DEFAULT 50000,
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
  status VARCHAR(20) NOT NULL DEFAULT 'open'
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'drink',
  price DECIMAL(10,0) NOT NULL,
  stock_quantity INT NOT NULL DEFAULT 0,
  min_stock_alert INT NOT NULL DEFAULT 5,
  unit VARCHAR(20) NOT NULL DEFAULT 'cái',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  session_id INT NOT NULL REFERENCES sessions(id),
  product_id INT NOT NULL REFERENCES products(id),
  quantity INT NOT NULL,
  unit_price DECIMAL(10,0) NOT NULL,
  subtotal DECIMAL(10,0) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loyalty_settings (
  id SERIAL PRIMARY KEY,
  points_per_10k_vnd INT NOT NULL DEFAULT 1,
  vnd_per_point INT NOT NULL DEFAULT 100,
  min_redeem_points INT NOT NULL DEFAULT 100
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
  printed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_transactions (
  id SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id),
  type VARCHAR(10) NOT NULL,
  quantity INT NOT NULL,
  note TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT
);

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

-- Seed 8 sample tables
INSERT INTO tables (name, hourly_rate) VALUES
  ('Bàn 1', 50000), ('Bàn 2', 50000), ('Bàn 3', 50000), ('Bàn 4', 50000),
  ('Bàn 5', 60000), ('Bàn 6', 60000), ('Bàn 7', 70000), ('Bàn 8', 70000)
ON CONFLICT DO NOTHING;
