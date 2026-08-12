-- 修掉資料庫裡指向不存在檔案的圖片路徑
--
-- 用「掃描所有 text 欄位裡的 /images/ 開頭字串，再跟實體檔案比對」找出來的。
-- 這類問題靜態 grep 抓不到 —— 路徑存在資料庫，不在程式碼裡。
--
-- 1) draw_records.prize_image_url = '/images/item.png'
--    這個檔案在 repo 裡從來沒存在過（正確檔名是 item_defaulet.webp，
--    「defaulet」是原本就有的 typo）。STG 有 3,383 筆歷史抽獎紀錄指向它，
--    玩家在倉庫／紀錄頁看到的就是破圖。
UPDATE draw_records SET prize_image_url = '/images/item_defaulet.webp'
WHERE prize_image_url = '/images/item.png';

-- 2) users.avatar_url = '/images/avatar/01.png'
--    這筆不用改資料 —— 檔案已經還原回 .png。
--    留這段註解是為了記錄：那次 WebP 批次轉檔把 avatar/01.png 轉成 .webp，
--    但 26 個機器人帳號的 avatar_url、四支 get_leaderboard_* 函數的
--    COALESCE 預設值、後台 leaderboard-bots 頁面都寫死 .png，全部變成破圖。
--    這類「檔案改名但路徑存在 DB 或 SQL 函數裡」的情況，改檔名前一定要先掃。
