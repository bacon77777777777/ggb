-- 1. Ensure the products bucket exists and is public
INSERT INTO storage.buckets (id, name, public)
VALUES ('products', 'products', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Public Access" ON storage.objects;

-- 3. Create a policy that allows all operations on the products bucket
-- This assumes RLS is already enabled on storage.objects (which is the default)
CREATE POLICY "Public Access"
ON storage.objects FOR ALL
USING ( bucket_id = 'products' )
WITH CHECK ( bucket_id = 'products' );
