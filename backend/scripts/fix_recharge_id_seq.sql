DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = 'recharge_records_id_seq'
  ) THEN
    EXECUTE 'CREATE SEQUENCE recharge_records_id_seq';
  END IF;

  -- Attach default to id
  EXECUTE 'ALTER TABLE public.recharge_records ALTER COLUMN id SET DEFAULT nextval(''recharge_records_id_seq''::regclass)';

  -- Set ownership
  EXECUTE 'ALTER SEQUENCE recharge_records_id_seq OWNED BY public.recharge_records.id';

  -- Advance sequence to current max(id)
  PERFORM setval('recharge_records_id_seq', COALESCE((SELECT MAX(id) FROM public.recharge_records), 0), true);
END $$;

