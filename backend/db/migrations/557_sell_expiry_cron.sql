-- 557_sell_expiry_cron.sql
--
-- 玩家商城訂單逾期處理的排程。每小時 :15 跑一次。
--
-- 避開 :00 —— 那個整點已經有 risk-check 在跑，錯開比較不會擠在一起。
--
-- ⚠️ 只在 PROD 執行：STG 沒有安裝 pg_cron（`cron.job` 這張表根本不存在）。
--
-- ⚠️ secret 一定要寫死在 SQL 裡。
--    Supabase 的 pg_cron 執行環境讀不到 `current_setting('app.cron_secret')`，
--    用動態讀取的話 job 會靜默失敗（HTTP 401，而且不會有人發現）。

SELECT cron.unschedule('sell-order-expiry')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sell-order-expiry');

SELECT cron.schedule(
  'sell-order-expiry',
  '15 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://admin.ggb.com.tw/api/cron/sell-order-expiry',
    headers := '{"Content-Type":"application/json","x-cron-secret":"6284ae7714d2c6d23124438c10c36f6f2bc297421c02fcfc35942c4285edd1f7"}'::jsonb,
    body    := '{}'::jsonb
  )
  $$
);
