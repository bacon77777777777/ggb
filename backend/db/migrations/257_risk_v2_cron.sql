-- W3-2：風控 v2 排程
-- risk-check 已存在，更新為每小時執行
SELECT cron.unschedule('risk-check') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'risk-check'
);

SELECT cron.schedule(
  'risk-check',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.base_url') || '/api/cron/risk-check',
    headers := jsonb_build_object(
      'x-cron-secret', current_setting('app.cron_secret'),
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  )
  $$
);

-- 系統健康監控：每 30 分鐘執行
SELECT cron.schedule(
  'health-check',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.base_url') || '/api/cron/health-check',
    headers := jsonb_build_object(
      'x-cron-secret', current_setting('app.cron_secret'),
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  )
  $$
);
