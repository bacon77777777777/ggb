-- Fix Categories RLS
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any to avoid conflicts
DROP POLICY IF EXISTS "Enable read access for all users" ON categories;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON categories;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON categories;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON categories;
DROP POLICY IF EXISTS "Enable all access for all users" ON categories;

-- Create comprehensive policy
CREATE POLICY "Enable all access for all users"
ON categories
FOR ALL
USING (true)
WITH CHECK (true);
