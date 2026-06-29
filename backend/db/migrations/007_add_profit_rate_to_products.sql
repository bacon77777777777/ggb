-- Add profit_rate column to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS profit_rate DECIMAL(10, 2) DEFAULT 1.0;

-- Comment on column
COMMENT ON COLUMN products.profit_rate IS 'Profit rate adjustment factor (1.0 = 100%)';
