-- W2-3：廠商月結自動快照（每月1日 02:00 UTC = 台灣時間 10:00）
SELECT cron.schedule(
  'monthly-settlement-snapshot',
  '0 2 1 * *',
  $$
  SELECT net.http_post(
    url := 'https://admin.ggb.com.tw/api/cron/monthly-settlement',
    headers := '{"x-cron-secret":"6284ae7714d2c6d23124438c10c36f6f2bc297421c02fcfc35942c4285edd1f7"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);
