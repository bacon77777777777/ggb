-- 445: 抽籤販售到期清除的排程
--
-- 直接排 DB 函數，不繞 API route：expire_lottery_holds() 沒有外部相依，
-- 走 API 只是多一層會壞的東西（CRON_SECRET、部署狀態、函數逾時）。
-- 每天台灣時間 04:00（UTC 20:00）跑一次，離峰時段。
--
-- STG 沒有安裝 pg_cron（整個環境本來就沒有任何排程），所以先確認 schema 存在
-- 再排 —— 不擋的話這支在 STG 會直接紅字，之後每次同步都要人工判斷
-- 「這個錯是預期的嗎」。

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    RAISE NOTICE '此環境沒有 pg_cron，跳過排程（STG 預期如此）';
    RETURN;
  END IF;

  PERFORM cron.unschedule('lottery-expire-daily')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'lottery-expire-daily');

  PERFORM cron.schedule(
    'lottery-expire-daily',
    '0 20 * * *',
    'SELECT public.expire_lottery_holds()'
  );
END $$;
