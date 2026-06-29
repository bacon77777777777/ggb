BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES ('marketplace', 'marketplace', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Marketplace images are publicly accessible" ON storage.objects;
CREATE POLICY "Marketplace images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'marketplace');

DROP POLICY IF EXISTS "Users can upload marketplace images" ON storage.objects;
CREATE POLICY "Users can upload marketplace images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'marketplace'
    AND auth.uid() IS NOT NULL
    AND name ~ ('^' || auth.uid()::text || '/')
  );

DROP POLICY IF EXISTS "Users can update their marketplace images" ON storage.objects;
CREATE POLICY "Users can update their marketplace images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'marketplace'
    AND auth.uid() IS NOT NULL
    AND name ~ ('^' || auth.uid()::text || '/')
  )
  WITH CHECK (
    bucket_id = 'marketplace'
    AND auth.uid() IS NOT NULL
    AND name ~ ('^' || auth.uid()::text || '/')
  );

DROP POLICY IF EXISTS "Users can delete their marketplace images" ON storage.objects;
CREATE POLICY "Users can delete their marketplace images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'marketplace'
    AND auth.uid() IS NOT NULL
    AND name ~ ('^' || auth.uid()::text || '/')
  );

NOTIFY pgrst, 'reload schema';

COMMIT;

