-- Migration 001: Agent Portal tables
-- Run once on the Render PostgreSQL database

-- 1. categories table
CREATE TABLE IF NOT EXISTS categories (
  id       SERIAL PRIMARY KEY,
  agent_id UUID        NOT NULL REFERENCES agents(id),
  name     VARCHAR(100) NOT NULL,
  icon     VARCHAR(10)  NOT NULL DEFAULT '📦',
  CONSTRAINT uq_category_name UNIQUE (name, agent_id)
);

-- 2. Add category_id to cloud_products (keep existing category column for backward compat)
ALTER TABLE cloud_products ADD COLUMN IF NOT EXISTS category_id INT REFERENCES categories(id);
ALTER TABLE cloud_products ADD COLUMN IF NOT EXISTS product_type VARCHAR(20) NOT NULL DEFAULT 'stock';

-- 3. promotions table
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

-- 4. cloud_staff table
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
