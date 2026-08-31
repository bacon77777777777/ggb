-- 660_merge_freeze_into_disable.sql
--
-- 「凍結」併進「停用」（老闆 2026-08-31）
--
-- ## 為什麼合併
--
-- 兩者對玩家**完全一樣**：`AuthContext` 只判斷 `status !== 'active'`，
-- 停用與凍結都是登不進來、看到同一則提示。差別只在凍結多了三樣東西：
-- 原因／時間／操作者、LINE 推播、以及「這個帳號有沒有待處理儲值」的財務提醒。
--
-- 那三樣是有價值的，所以不是砍掉凍結，而是**把它們搬進停用** ——
-- 之後只剩一個概念，客服不用再問「這兩個差在哪」。
--
-- ## 這支做兩件事
--
-- 1. 欄位改名 frozen_* → disabled_*。留著 frozen_ 這個名字會讓人以為還有
--    第二種狀態，而且「停用原因存在 frozen_reason」本身就是個謎題。
-- 2. 既有 status='frozen' 的資料轉成 'inactive'，原因照舊保留。

BEGIN;

ALTER TABLE users RENAME COLUMN frozen_at     TO disabled_at;
ALTER TABLE users RENAME COLUMN frozen_by     TO disabled_by;
ALTER TABLE users RENAME COLUMN frozen_reason TO disabled_reason;

COMMENT ON COLUMN users.disabled_at IS '停用時間。原名 frozen_at —— 凍結與停用於 2026-08-31 合併';
COMMENT ON COLUMN users.disabled_by IS '停用的操作者（admin#<id> 或 GB哥）';
COMMENT ON COLUMN users.disabled_reason IS '停用原因。後台停用時必填一句話，會顯示在會員列表的標記與詳情的安全設置';

-- 既有的凍結帳號轉成停用。玩家端行為本來就一樣，所以這一步對他們沒有任何影響
UPDATE users SET status = 'inactive' WHERE status = 'frozen';

COMMIT;

-- 驗收：兩個環境都要是 0
--   SELECT count(*) FROM users WHERE status = 'frozen';
