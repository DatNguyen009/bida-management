-- Migration: thêm cost_price, before_qty, after_qty vào stock_transactions
ALTER TABLE stock_transactions
  ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12,0) NULL,
  ADD COLUMN IF NOT EXISTS before_qty INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS after_qty INT NOT NULL DEFAULT 0;
