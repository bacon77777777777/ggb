-- 抽卡市價每日更新排程（老闆 2026-09-03）。每天台灣時間 04:00（UTC 20:00）打後台的 card-price-daily。
-- ⚠️ 只在 PROD 跑：STG 沒有 pg_cron（其他排程也都只在 PROD）。secret 照慣例 hardcode（pg_cron 讀不到 current_setting）。
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'card-price-daily') THEN
      PERFORM cron.unschedule('card-price-daily');
    END IF;
    PERFORM cron.schedule('card-price-daily', '0 20 * * *', $cmd$
      SELECT net.http_post(
        url     := 'https://admin.ggb.com.tw/api/cron/card-price-daily',
        headers := '{"Content-Type":"application/json","x-cron-secret":"6284ae7714d2c6d23124438c10c36f6f2bc297421c02fcfc35942c4285edd1f7"}'::jsonb,
        body    := '{}'::jsonb
      )
    $cmd$);
  END IF;
END $$;
