-- W3-1：自動確認送達排程（每天凌晨 03:00 執行）
-- HOME 宅配超過 7 天 / CVS 超商超過 3 天 → 自動標 delivered
SELECT cron.schedule(
  'auto-deliver',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.base_url') || '/api/cron/auto-deliver',
    headers := jsonb_build_object(
      'x-cron-secret', current_setting('app.cron_secret'),
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  )
  $$
);
