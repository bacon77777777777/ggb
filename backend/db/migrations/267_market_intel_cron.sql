-- 市場情報官 — 每週一 TW 11:00（UTC 03:00）自動爬竟品
SELECT cron.schedule(
  'market-intel-weekly',
  '0 3 * * 1',
  $$
    SELECT net.http_post(
      url     := 'https://admin.ggb.com.tw/api/cron/market-intel',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'x-cron-secret', '6284ae7714d2c6d23124438c10c36f6f2bc297421c02fcfc35942c4285edd1f7'
      ),
      body    := '{}'::jsonb
    ) AS request_id;
  $$
);
