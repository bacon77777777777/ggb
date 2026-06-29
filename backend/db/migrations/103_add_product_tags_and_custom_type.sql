-- 1. Update Type Constraint to include 'custom'
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_type_check;
ALTER TABLE products ADD CONSTRAINT products_type_check 
CHECK (type IN ('ichiban', 'blindbox', 'gacha', 'card', 'custom'));

-- 2. Create Product Tags (Junction Table)
CREATE TABLE IF NOT EXISTS product_tags (
    product_id BIGINT REFERENCES products(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (product_id, category_id)
);

-- 3. Enable RLS
ALTER TABLE product_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all access for all users" ON product_tags;

CREATE POLICY "Enable all access for all users"
ON product_tags
FOR ALL
USING (true)
WITH CHECK (true);

-- 4. Migrate existing 1:1 category to tags
-- Insert into product_tags based on existing category_id in products
INSERT INTO product_tags (product_id, category_id)
SELECT id, category_id FROM products WHERE category_id IS NOT NULL
ON CONFLICT DO NOTHING;
