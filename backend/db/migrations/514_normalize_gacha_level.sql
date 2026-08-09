-- 514: 轉蛋/盒玩品項等級統一為「一般版」
--
-- 現況一團亂（前後台顯示各自 fallback，才會出現賞等膠囊顯示品項名稱）：
--   - PROD 轉蛋品項 level 幾乎全空、少數 'Normal / Common'
--   - STG 轉蛋品項 level 大量被填成「品項名稱」（舊建立流程的髒資料）、盒玩為 '普通款'
--   - 前台把轉蛋/盒玩 hardcode 顯示「普通」、後台編輯鎖定顯示「普通」——三套名字
--
-- 老闆定案：轉蛋/盒玩沒特別設定的等級一律「一般版」，前後台顯示同名。
-- 特別設定過的（稀有版/隱藏版/異色款…）不動。

UPDATE public.product_prizes pp
SET level = '一般版'
FROM public.products p
WHERE p.id = pp.product_id
  AND p.type IN ('gacha', 'blindbox')
  AND (
    pp.level IS NULL
    OR btrim(pp.level) = ''
    OR pp.level IN ('普通', '普通款', 'Normal / Common')
    OR pp.level = pp.name   -- 等級被填成品項名稱的髒資料
  );

-- draw_records 的等級快照同步（同樣只動轉蛋/盒玩的預設/髒值）
UPDATE public.draw_records dr
SET prize_level = '一般版'
FROM public.products p
WHERE p.id = dr.product_id
  AND p.type IN ('gacha', 'blindbox')
  AND (
    dr.prize_level IS NULL
    OR btrim(dr.prize_level) = ''
    OR dr.prize_level IN ('普通', '普通款', 'Normal / Common')
    OR dr.prize_level = dr.prize_name
  );
