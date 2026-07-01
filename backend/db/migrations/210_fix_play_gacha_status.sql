-- play_gacha 在 194 已正確檢查 status = 'active'，
-- 202 migration 意外覆蓋成 'selling' 並改變回傳格式（物件而非陣列）。
-- 本 migration 已在 DB 中直接重新執行 194 的函數定義，恢復正確版本。
-- （本文件僅作紀錄，實際修復是執行 194 migration）
SELECT 1;
