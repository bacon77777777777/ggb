-- 財務長 AI 日報 — 每天 TW 08:30（UTC 00:30）
SELECT cron.schedule(
  'cfo-agent-daily',
  '30 0 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://admin.ggb.com.tw/api/cron/cfo-agent',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'x-cron-secret', '6284ae7714d2c6d23124438c10c36f6f2bc297421c02fcfc35942c4285edd1f7'
      ),
      body    := '{}'::jsonb
    ) AS request_id;
  $$
);
