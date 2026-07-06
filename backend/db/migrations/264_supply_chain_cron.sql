-- 供應鏈協調員 cron — 每天 10:30 / 22:30 TW（UTC 02:30 / 14:30）
SELECT cron.schedule(
  'supply-chain-morning',
  '30 2 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://admin.ggb.com.tw/api/cron/supply-chain',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'x-cron-secret', '6284ae7714d2c6d23124438c10c36f6f2bc297421c02fcfc35942c4285edd1f7'
      ),
      body    := '{}'::jsonb
    ) AS request_id;
  $$
);

SELECT cron.schedule(
  'supply-chain-evening',
  '30 14 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://admin.ggb.com.tw/api/cron/supply-chain',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'x-cron-secret', '6284ae7714d2c6d23124438c10c36f6f2bc297421c02fcfc35942c4285edd1f7'
      ),
      body    := '{}'::jsonb
    ) AS request_id;
  $$
);
