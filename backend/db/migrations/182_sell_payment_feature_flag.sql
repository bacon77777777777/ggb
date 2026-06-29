BEGIN;

INSERT INTO public.feature_flags (key, enabled)
VALUES
  ('sell_escrow', false)
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
