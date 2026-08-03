-- 415: 公告自動發送的來源標記
--
-- 公告原本全是手動建立、且資料表是空的。要開放系統自動發送就必須能防重複：
-- cron 每次跑都會看到同一檔活動、同一個機台主題，沒有唯一鍵就會每小時發一則。
--
-- source_key 為「來源類型:識別碼」，例如 event:<uuid>、theme:<id>、products:<日期>，
-- 以唯一索引擋掉重複。手動建立的公告 source_key 為 NULL，不受影響
-- （PostgreSQL 唯一索引不會限制多個 NULL）。

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS source_key TEXT;

COMMENT ON COLUMN public.announcements.source_key IS
  '自動發送的來源鍵（event:<id> / theme:<id> / products:<date>）。手動建立為 NULL。';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_announcements_source_key
  ON public.announcements (source_key)
  WHERE source_key IS NOT NULL;
