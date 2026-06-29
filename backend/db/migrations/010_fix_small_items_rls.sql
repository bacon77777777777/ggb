-- Fix RLS for small_items table
ALTER TABLE small_items ENABLE ROW LEVEL SECURITY;

-- Remove potential conflicting policies
DROP POLICY IF EXISTS "Public access" ON small_items;
DROP POLICY IF EXISTS "Allow read access to authenticated users" ON small_items;
DROP POLICY IF EXISTS "Allow write access to authenticated users" ON small_items;
DROP POLICY IF EXISTS "Enable access for all users" ON small_items;
DROP POLICY IF EXISTS "Enable all access for all users" ON small_items;

-- Create a comprehensive policy for all users (authenticated and anon)
CREATE POLICY "Enable all access for all users"
ON small_items
FOR ALL
USING (true)
WITH CHECK (true);
