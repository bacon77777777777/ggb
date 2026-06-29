
-- Enable RLS on all relevant tables to ensure security policies can be applied
ALTER TABLE IF EXISTS users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS products ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS draw_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS recharge_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS product_prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS small_items ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts (and ensure clean state)
DROP POLICY IF EXISTS "Public access" ON users;
DROP POLICY IF EXISTS "Public access" ON products;
DROP POLICY IF EXISTS "Public access" ON orders;
DROP POLICY IF EXISTS "Public access" ON draw_records;
DROP POLICY IF EXISTS "Public access" ON recharge_records;
DROP POLICY IF EXISTS "Public access" ON admins;
DROP POLICY IF EXISTS "Public access" ON roles;
DROP POLICY IF EXISTS "Public access" ON order_items;
DROP POLICY IF EXISTS "Public access" ON product_prizes;
DROP POLICY IF EXISTS "Public access" ON small_items;

-- Also drop "authenticated" policies if they exist (from 004 etc) to avoid confusion, 
-- or just add Public access which might coexist. 
-- But simpler to just have one clear policy for this phase.
DROP POLICY IF EXISTS "Allow read access to authenticated users" ON small_items;
DROP POLICY IF EXISTS "Allow write access to authenticated users" ON small_items;

-- Create policies allowing full access for anon role (for admin panel usage)
-- NOTE: In a production environment, this should be restricted to authenticated users only.
-- However, since the admin panel currently uses the anon key and custom auth, we need to allow anon access.
CREATE POLICY "Public access" ON users FOR ALL USING (true);
CREATE POLICY "Public access" ON products FOR ALL USING (true);
CREATE POLICY "Public access" ON orders FOR ALL USING (true);
CREATE POLICY "Public access" ON draw_records FOR ALL USING (true);
CREATE POLICY "Public access" ON recharge_records FOR ALL USING (true);
CREATE POLICY "Public access" ON admins FOR ALL USING (true);
CREATE POLICY "Public access" ON roles FOR ALL USING (true);
CREATE POLICY "Public access" ON order_items FOR ALL USING (true);
CREATE POLICY "Public access" ON product_prizes FOR ALL USING (true);
CREATE POLICY "Public access" ON small_items FOR ALL USING (true);
