-- 行銷長 AI 日報 — 每天 TW 09:00（UTC 01:00）
SELECT cron.schedule(
  'cmo-agent-daily',
  '0 1 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://admin.ggb.com.tw/api/cron/cmo-agent',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'x-cron-secret', '6284ae7714d2c6d23124438c10c36f6f2bc297421c02fcfc35942c4285edd1f7'
      ),
      body    := '{}'::jsonb
    ) AS request_id;
  $$
);
