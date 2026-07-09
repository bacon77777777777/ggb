-- 修正 news-agent-hourly：改用 hardcode secret（current_setting('app.cron_secret') 在 Supabase 拿不到值）
SELECT cron.unschedule('news-agent-hourly');

SELECT cron.schedule(
  'news-agent-hourly',
  '0 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://admin.ggb.com.tw/api/cron/news-agent',
      headers := '{"Content-Type":"application/json","x-cron-secret":"6284ae7714d2c6d23124438c10c36f6f2bc297421c02fcfc35942c4285edd1f7"}'::jsonb,
      body    := '{}'::jsonb
    );
  $$
);
