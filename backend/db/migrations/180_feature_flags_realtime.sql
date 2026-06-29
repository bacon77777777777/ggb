BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'feature_flags'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.feature_flags;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

