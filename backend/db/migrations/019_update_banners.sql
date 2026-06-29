-- Add name column to banners
ALTER TABLE banners ADD COLUMN IF NOT EXISTS name TEXT;

-- Create banners bucket if not exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('banners', 'banners', true)
ON CONFLICT (id) DO NOTHING;

-- Policy for banners bucket
-- Drop existing policy if it exists to avoid error
DROP POLICY IF EXISTS "Public Access Banners" ON storage.objects;

CREATE POLICY "Public Access Banners"
ON storage.objects FOR ALL
USING ( bucket_id = 'banners' )
WITH CHECK ( bucket_id = 'banners' );

-- Reload schema cache to ensure API picks up the new column
NOTIFY pgrst, 'reload schema';
