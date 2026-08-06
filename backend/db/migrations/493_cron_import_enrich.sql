-- 493：商品補齊工作的排程
--
-- 每分鐘打一次，每次處理 6 筆。跑不完下一輪繼續 —— 沒有待處理的列時
-- 那支 API 會立刻回 processed:0，所以空跑的成本可以忽略。
--
-- secret 必須寫死在 SQL 裡：Supabase 的 pg_cron 執行環境沒辦法用
-- current_setting('app.cron_secret')（見 CLAUDE.md）。
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.unschedule('import-enrich')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'import-enrich');

    PERFORM cron.schedule('import-enrich', '* * * * *', $cron$
      SELECT net.http_post(
        url     := 'https://admin.ggb.com.tw/api/cron/import-enrich',
        headers := '{"Content-Type":"application/json","x-cron-secret":"6284ae7714d2c6d23124438c10c36f6f2bc297421c02fcfc35942c4285edd1f7"}'::jsonb,
        body    := '{}'::jsonb
      )
    $cron$);
  ELSE
    RAISE NOTICE '這個環境沒有 pg_cron，跳過排程';
  END IF;
END
$$;
