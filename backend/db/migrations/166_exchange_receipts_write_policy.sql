BEGIN;

DROP POLICY IF EXISTS "Exchange Receipts Write" ON storage.objects;

CREATE POLICY "Exchange Receipts Write"
ON storage.objects FOR ALL
USING (
  bucket_id = 'exchange-receipts'
  AND auth.role() = 'authenticated'
  AND (regexp_match(name, '^exchange_orders/([0-9a-fA-F-]{36})/')) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.exchange_orders o
    WHERE o.id = ((regexp_match(name, '^exchange_orders/([0-9a-fA-F-]{36})/'))[1])::uuid
      AND (auth.uid() = o.owner_id OR auth.uid() = o.initiator_id)
  )
)
WITH CHECK (
  bucket_id = 'exchange-receipts'
  AND auth.role() = 'authenticated'
  AND (regexp_match(name, '^exchange_orders/([0-9a-fA-F-]{36})/')) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.exchange_orders o
    WHERE o.id = ((regexp_match(name, '^exchange_orders/([0-9a-fA-F-]{36})/'))[1])::uuid
      AND (auth.uid() = o.owner_id OR auth.uid() = o.initiator_id)
  )
);

COMMIT;

