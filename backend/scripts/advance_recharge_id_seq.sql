DO $$
DECLARE
  seq_name text;
  max_id bigint;
BEGIN
  SELECT pg_get_serial_sequence('public.recharge_records','id') INTO seq_name;
  IF seq_name IS NULL THEN
    RAISE NOTICE 'No sequence found for recharge_records.id';
    RETURN;
  END IF;
  SELECT COALESCE(MAX(id), 0) INTO max_id FROM public.recharge_records;
  EXECUTE format('SELECT setval(%L, %s, true);', seq_name, max_id);
END $$;

