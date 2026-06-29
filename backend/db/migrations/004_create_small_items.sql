-- Create small_items table
CREATE TABLE IF NOT EXISTS small_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  image_url TEXT,
  category TEXT,
  level TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add RLS policies
ALTER TABLE small_items ENABLE ROW LEVEL SECURITY;

-- Allow read access to authenticated users (admins)
CREATE POLICY "Allow read access to authenticated users"
  ON small_items
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow write access to authenticated users (admins)
CREATE POLICY "Allow write access to authenticated users"
  ON small_items
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
