-- Add type column to products table
-- 用於區分：一番賞(ichiban)、盒玩(blindbox)、轉蛋(gacha)

-- 1. Create enum type for product types if not exists (or just use check constraint)
-- Using check constraint is more flexible for updates
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS type VARCHAR(20) NOT NULL DEFAULT 'ichiban';

-- 2. Add check constraint
ALTER TABLE products 
ADD CONSTRAINT products_type_check 
CHECK (type IN ('ichiban', 'blindbox', 'gacha'));

-- 3. Update existing records (optional, default is already ichiban)
UPDATE products SET type = 'ichiban' WHERE type IS NULL;

-- 4. Notify schema reload
NOTIFY pgrst, 'reload schema';
