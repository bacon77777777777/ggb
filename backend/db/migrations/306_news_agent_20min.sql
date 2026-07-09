-- news-agent 改為每 20 分鐘執行一次
SELECT cron.unschedule('news-agent-hourly');

SELECT cron.schedule(
  'news-agent-20min',
  '*/20 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://admin.ggb.com.tw/api/cron/news-agent',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'x-cron-secret', '6284ae7714d2c6d23124438c10c36f6f2bc297421c02fcfc35942c4285edd1f7'
      ),
      body := '{}'::jsonb
    );
  $$
);
