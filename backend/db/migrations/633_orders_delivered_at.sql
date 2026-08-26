-- 633: orders.delivered_at（老闆 2026-08-26 指定詳情要顯示「送達日期」）
--
-- 原本只有 submitted_at 與 shipped_at，送達的時間點沒有留 —— 訂單標成 delivered
-- 之後就只剩 updated_at，而那欄任何一次更新都會動，不能當送達時間用。

ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

COMMENT ON COLUMN orders.delivered_at IS
  '送達時間。狀態轉為 delivered 時寫入（後台手動、綠界 callback、auto-deliver cron 三處）。';

-- 既有已送達的單沒有這個時間點，用 shipped_at 當近似值回填 ——
-- 留白會讓詳情頁顯示「—」，看起來像資料壞了。新單一律是實際寫入的時間。
UPDATE orders
   SET delivered_at = COALESCE(shipped_at, updated_at, submitted_at)
 WHERE status = 'delivered' AND delivered_at IS NULL;
