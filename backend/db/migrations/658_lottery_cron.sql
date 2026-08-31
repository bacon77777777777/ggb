-- 658_lottery_cron.sql
--
-- 抽籤販售的定時工作：每小時整點跑一次 /api/cron/lottery
--   ① 到時間就開獎（draw_at 已過、已發布、還沒開過的檔期）
--   ② 逾期未付就遞補（正取超過付款期限，讓給名次最前面的備取）
--
-- 每小時而不是每分鐘：開獎時間是後台自己訂的，訂在整點就好；付款期限以小時計，
-- 每分鐘掃只是白白多 1,440 次呼叫。真的要準時到分鐘的檔期，後台有「立即開獎」。
--
-- ⚠️ secret 直接寫死在 SQL 裡：Supabase 的 pg_cron 執行環境讀不到
-- `current_setting('app.cron_secret')`（CLAUDE.md 記過這個坑），所有 cron job 都是這樣寫。
--
-- 只在 PROD 建。STG 沒有對外網域可打，而且測試資料自動開獎只會製造噪音 ——
-- STG 要驗證的話用後台的「立即開獎」。

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('lottery-hourly')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'lottery-hourly');

    PERFORM cron.schedule('lottery-hourly', '0 * * * *', $cmd$
      SELECT net.http_post(
        url     := 'https://admin.ggb.com.tw/api/cron/lottery',
        headers := '{"Content-Type":"application/json","x-cron-secret":"6284ae7714d2c6d23124438c10c36f6f2bc297421c02fcfc35942c4285edd1f7"}'::jsonb,
        body    := '{}'::jsonb
      )
    $cmd$);
  END IF;
END $$;
