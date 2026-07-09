-- 平台監控快照表
CREATE TABLE IF NOT EXISTS platform_monitor_logs (
  id              BIGSERIAL PRIMARY KEY,
  checked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Supabase DB
  supabase_db_mb  FLOAT,
  supabase_status TEXT NOT NULL DEFAULT 'unknown',

  -- Cloudflare R2
  r2_objects      INTEGER,
  r2_size_mb      FLOAT,
  r2_status       TEXT NOT NULL DEFAULT 'unknown',

  -- Vercel
  vercel_status         TEXT NOT NULL DEFAULT 'unknown',
  vercel_deploy_state   TEXT,
  vercel_deployed_at    TIMESTAMPTZ,
  vercel_deploy_url     TEXT,

  -- GitHub
  github_status         TEXT NOT NULL DEFAULT 'unknown',
  github_ci_conclusion  TEXT,
  github_commit_sha     TEXT,
  github_committed_at   TIMESTAMPTZ,

  -- 整體
  overall_status  TEXT NOT NULL DEFAULT 'ok',
  alerts          JSONB NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_platform_monitor_checked_at ON platform_monitor_logs (checked_at DESC);

-- 只保留 30 天
CREATE OR REPLACE FUNCTION cleanup_platform_monitor_logs() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM platform_monitor_logs WHERE checked_at < NOW() - INTERVAL '30 days';
END;
$$;

-- pg_cron：每 6 小時跑一次（UTC 0/6/12/18 = 台灣 8/14/20/2 點）
SELECT cron.schedule(
  'platform-monitor',
  '0 0,6,12,18 * * *',
  format(
    $$SELECT net.http_post(url := %L, headers := jsonb_build_object('x-cron-secret', %L), body := '{}')$$,
    (SELECT current_setting('app.backend_url') || '/api/cron/platform-monitor'),
    current_setting('app.cron_secret')
  )
);
