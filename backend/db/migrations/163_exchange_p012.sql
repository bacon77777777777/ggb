BEGIN;

ALTER TABLE exchange_messages DROP CONSTRAINT IF EXISTS exchange_messages_kind_check;
ALTER TABLE exchange_messages ADD CONSTRAINT exchange_messages_kind_check CHECK (kind IN ('text', 'system', 'offer'));

ALTER TABLE exchange_orders ADD COLUMN IF NOT EXISTS tracking_numbers JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE exchange_orders ADD COLUMN IF NOT EXISTS ratings JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE exchange_orders ADD COLUMN IF NOT EXISTS cancelled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE exchange_orders ALTER COLUMN recipient SET DEFAULT '{}'::jsonb;
ALTER TABLE exchange_orders ALTER COLUMN receipt_media SET DEFAULT '{}'::jsonb;

UPDATE exchange_orders SET recipient = '{}'::jsonb WHERE recipient IS NULL;
UPDATE exchange_orders SET receipt_media = '{}'::jsonb WHERE receipt_media IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS exchange_orders_offer_one_active_idx
  ON exchange_orders (offer_id)
  WHERE done = FALSE AND cancelled = FALSE;

INSERT INTO storage.buckets (id, name, public)
VALUES ('exchange-receipts', 'exchange-receipts', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public Access Exchange Receipts" ON storage.objects;
CREATE POLICY "Public Access Exchange Receipts"
ON storage.objects FOR ALL
USING (bucket_id = 'exchange-receipts')
WITH CHECK (bucket_id = 'exchange-receipts');

ALTER TABLE exchange_messages REPLICA IDENTITY FULL;
ALTER TABLE exchange_orders REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'exchange_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE exchange_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'exchange_orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE exchange_orders;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

