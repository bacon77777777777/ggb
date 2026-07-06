-- W5-4: 競品週報分析 — 每週一 10:00 TW（UTC 02:00）
SELECT cron.schedule(
  'competitive-intel',
  '0 2 * * 1',
  $$
    SELECT net.http_post(
      url     := 'https://admin.ggb.com.tw/api/cron/competitive-intel',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'x-cron-secret', '6284ae7714d2c6d23124438c10c36f6f2bc297421c02fcfc35942c4285edd1f7'
      ),
      body    := '{}'::jsonb
    ) AS request_id;
  $$
);
