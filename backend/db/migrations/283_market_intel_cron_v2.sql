-- 市場情報官排程 v2
-- 每日 daily 改回每週（日曜 11:30 TW = 03:30 UTC）
-- 另加每月一次競品發現（每月1日 10:00 TW = 02:00 UTC）

SELECT cron.unschedule('market-intel-daily');

-- 每週日 11:30 TW（03:30 UTC）：完整雙層分析
SELECT cron.schedule(
  'market-intel-weekly',
  '30 3 * * 0',
  $$
    SELECT net.http_post(
      url     := current_setting('app.backend_url') || '/api/cron/market-intel',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'x-cron-secret', current_setting('app.cron_secret')
      ),
      body    := '{}'::jsonb
    ) AS request_id;
  $$
);

-- 每月1日 10:00 TW（02:00 UTC）：競品發現
SELECT cron.schedule(
  'market-discovery-monthly',
  '0 2 1 * *',
  $$
    SELECT net.http_post(
      url     := current_setting('app.backend_url') || '/api/cron/market-intel?mode=discovery',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'x-cron-secret', current_setting('app.cron_secret')
      ),
      body    := '{}'::jsonb
    ) AS request_id;
  $$
);
