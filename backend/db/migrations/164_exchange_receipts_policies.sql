BEGIN;

DROP POLICY IF EXISTS "Public Access Exchange Receipts" ON storage.objects;
DROP POLICY IF EXISTS "Exchange Receipts Read" ON storage.objects;
DROP POLICY IF EXISTS "Exchange Receipts Write" ON storage.objects;

CREATE POLICY "Exchange Receipts Read"
ON storage.objects FOR SELECT
USING (bucket_id = 'exchange-receipts');

CREATE POLICY "Exchange Receipts Write"
ON storage.objects FOR ALL
USING (bucket_id = 'exchange-receipts' AND auth.role() = 'authenticated')
WITH CHECK (bucket_id = 'exchange-receipts' AND auth.role() = 'authenticated');

COMMIT;

