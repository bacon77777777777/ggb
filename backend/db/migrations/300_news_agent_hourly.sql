-- 將 news-agent 排程從每天 06:30 改為每小時整點
SELECT cron.unschedule('news-agent-daily');

SELECT cron.schedule(
  'news-agent-hourly',
  '0 * * * *',   -- 每小時整點（UTC），台灣時間 +8
  $$
    SELECT net.http_post(
      url     := 'https://admin.ggb.com.tw/api/cron/news-agent',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'x-cron-secret', current_setting('app.cron_secret')
      ),
      body := '{}'::jsonb
    );
  $$
);
