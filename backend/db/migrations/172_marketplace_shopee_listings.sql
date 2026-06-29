BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'marketplace_listings') THEN
    ALTER TABLE public.marketplace_listings
      ALTER COLUMN draw_record_id DROP NOT NULL;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'marketplace_listings' AND column_name = 'title'
    ) THEN
      ALTER TABLE public.marketplace_listings ADD COLUMN title TEXT;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'marketplace_listings' AND column_name = 'items'
    ) THEN
      ALTER TABLE public.marketplace_listings ADD COLUMN items JSONB DEFAULT '[]'::jsonb;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'marketplace_listings' AND policyname = 'Sellers manage listings') THEN
    DROP POLICY "Sellers manage listings" ON public.marketplace_listings;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'marketplace_listings') THEN
    CREATE POLICY "Sellers manage listings"
    ON public.marketplace_listings
    FOR ALL
    USING (seller_id = auth.uid())
    WITH CHECK (seller_id = auth.uid());
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

