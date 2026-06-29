-- Fix RLS for products and product_prizes tables
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_prizes ENABLE ROW LEVEL SECURITY;

-- Remove potential conflicting policies for products
DROP POLICY IF EXISTS "Public access" ON products;
DROP POLICY IF EXISTS "Allow read access to authenticated users" ON products;
DROP POLICY IF EXISTS "Allow write access to authenticated users" ON products;
DROP POLICY IF EXISTS "Enable access for all users" ON products;
DROP POLICY IF EXISTS "Enable all access for all users" ON products;

-- Create a comprehensive policy for all users for products
CREATE POLICY "Enable all access for all users"
ON products
FOR ALL
USING (true)
WITH CHECK (true);

-- Remove potential conflicting policies for product_prizes
DROP POLICY IF EXISTS "Public access" ON product_prizes;
DROP POLICY IF EXISTS "Allow read access to authenticated users" ON product_prizes;
DROP POLICY IF EXISTS "Allow write access to authenticated users" ON product_prizes;
DROP POLICY IF EXISTS "Enable access for all users" ON product_prizes;
DROP POLICY IF EXISTS "Enable all access for all users" ON product_prizes;

-- Create a comprehensive policy for all users for product_prizes
CREATE POLICY "Enable all access for all users"
ON product_prizes
FOR ALL
USING (true)
WITH CHECK (true);
