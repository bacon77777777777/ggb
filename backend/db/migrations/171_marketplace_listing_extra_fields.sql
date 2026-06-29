BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'marketplace_listings') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'marketplace_listings' AND column_name = 'note'
    ) THEN
      ALTER TABLE public.marketplace_listings ADD COLUMN note TEXT;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'marketplace_listings' AND column_name = 'images'
    ) THEN
      ALTER TABLE public.marketplace_listings ADD COLUMN images TEXT[] DEFAULT ARRAY[]::TEXT[];
    END IF;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

