-- GB哥週報：每週一 01:00 UTC = 09:00 台灣時間
SELECT cron.schedule(
  'weekly-report',
  '0 1 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://admin.ggb.com.tw/api/cron/weekly-report',
    headers := '{"Content-Type":"application/json","x-cron-secret":"6284ae7714d2c6d23124438c10c36f6f2bc297421c02fcfc35942c4285edd1f7"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
