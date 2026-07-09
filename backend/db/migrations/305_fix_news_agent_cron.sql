-- 修正 news-agent-hourly：改用 hardcode secret，避免 current_setting 拿不到值
SELECT cron.unschedule('news-agent-hourly');

SELECT cron.schedule(
  'news-agent-hourly',
  '0 * * * *',
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
