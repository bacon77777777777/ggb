-- Add logistics columns to orders table for delivery flow
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS logistics_type TEXT,
  ADD COLUMN IF NOT EXISTS logistics_subtype TEXT,
  ADD COLUMN IF NOT EXISTS store_id TEXT,
  ADD COLUMN IF NOT EXISTS store_name TEXT;
