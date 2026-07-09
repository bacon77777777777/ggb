-- news-agent：每天 TW 06:30 爬取日本最新玩具新聞（UTC 22:30 前一天）
SELECT cron.schedule(
  'news-agent-daily',
  '30 22 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://admin.ggb.com.tw/api/cron/news-agent',
      headers := '{"Content-Type":"application/json","x-cron-secret":"6284ae7714d2c6d23124438c10c36f6f2bc297421c02fcfc35942c4285edd1f7"}'::jsonb,
      body    := '{}'::jsonb
    );
  $$
);
