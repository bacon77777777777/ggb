-- Temp store for CVS store selections during ECPay map flow (iOS PWA workaround)
CREATE TABLE IF NOT EXISTS cvs_pending_selections (
  token TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  store_name TEXT NOT NULL DEFAULT '',
  store_address TEXT NOT NULL DEFAULT '',
  logistics_subtype TEXT NOT NULL DEFAULT 'UNIMARTC2C',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-cleanup records older than 10 minutes via cron or on insert (keep table tiny)
-- Frontend polls for max 90 seconds, so 10-min TTL is plenty
