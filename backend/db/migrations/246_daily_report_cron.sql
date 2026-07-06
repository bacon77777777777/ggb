-- Migration 246: 每日早報 pg_cron 排程
-- 每日台灣時間 08:00（= UTC 00:00）推播 LINE 每日早報
--
-- 前置條件：
--   1. Supabase Dashboard → Database → Extensions → 啟用 pg_cron + pg_net
--   2. 在 Vercel 後台設定以下環境變數：
--        CRON_SECRET      = <隨機強密碼>
--        NOTIFY_TARGET_TYPE = user  （或 group）
--        NOTIFY_TARGET_ID   = <LINE userId 或 groupId>
--
-- 使用前請將 <BACKEND_URL> 替換為實際 Vercel 部署網址（含 https://）

-- 儲存後台網址，方便後續修改
SELECT cron.schedule(
  'daily-line-report',          -- job 名稱
  '0 0 * * *',                  -- 每日 00:00 UTC（= 台灣 08:00）
  $$
    SELECT net.http_post(
      url     := current_setting('app.backend_url') || '/api/cron/daily-report',
      headers := jsonb_build_object(
        'Content-Type',    'application/json',
        'x-cron-secret',   current_setting('app.cron_secret')
      ),
      body    := '{}'::jsonb
    )
  $$
);

-- 設定 GUC 參數（執行後在 Supabase Dashboard → SQL Editor 手動設定一次）
-- ALTER DATABASE postgres SET app.backend_url  = 'https://your-backend.vercel.app';
-- ALTER DATABASE postgres SET app.cron_secret  = 'your-cron-secret';
