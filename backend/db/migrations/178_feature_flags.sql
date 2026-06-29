BEGIN;

CREATE TABLE IF NOT EXISTS public.feature_flags (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Feature flags - public read" ON public.feature_flags;
CREATE POLICY "Feature flags - public read"
  ON public.feature_flags
  FOR SELECT
  USING (true);

INSERT INTO public.feature_flags (key, enabled)
VALUES
  ('sell', true),
  ('ichiban', true),
  ('blindbox', true),
  ('gacha', true),
  ('card', true),
  ('custom', true),
  ('exchange', true),
  ('market', false)
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;

