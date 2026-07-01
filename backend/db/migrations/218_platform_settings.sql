-- Platform-level key-value settings (e.g. shipping fee)
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed default shipping fee
INSERT INTO public.platform_settings (key, value)
VALUES ('shipping_fee_home', '60')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.platform_settings (key, value)
VALUES ('shipping_fee_cvs', '60')
ON CONFLICT (key) DO NOTHING;

-- Admin-only: no public read/write via RLS
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
