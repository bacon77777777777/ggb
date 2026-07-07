-- 行銷長：從 TW 09:00 改為 TW 11:00（UTC 03:00）
SELECT cron.unschedule('cmo-agent-daily');
SELECT cron.schedule(
  'cmo-agent-daily',
  '0 3 * * *',
  $$
    SELECT net.http_post(
      url     := current_setting('app.backend_url') || '/api/cron/cmo-agent',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'x-cron-secret', current_setting('app.cron_secret')
      ),
      body    := '{}'::jsonb
    ) AS request_id;
  $$
);

-- 市場情報官：從每週一 TW 11:00 改為每日 TW 11:30（UTC 03:30）
SELECT cron.unschedule('market-intel-weekly');
SELECT cron.schedule(
  'market-intel-daily',
  '30 3 * * *',
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
