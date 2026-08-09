-- 516: 轉蛋/盒玩機率一律依數量佔比（老闆定案：機率不開放手動設定）
--
-- 515 修了單位問題（小數 → 百分比），這裡進一步把規則定死：
-- 機率 = 品項數量 / 商品總數量 × 100（實體轉蛋本來就是箱子裡有幾顆是幾顆）。
-- 匯入端已移除機率欄（productSchema），單筆編輯器本來就是自動計算 ——
-- 這裡把現有商品全部重算乾淨，讓 DB 與規則一致。
-- 最後賞不佔機率（觸發式，不進輪盤），維持 0。

UPDATE public.product_prizes pp
SET probability = CASE
  WHEN pp.level IN ('Last One', 'LAST ONE', 'last one', '最後賞') OR pp.is_last_one = TRUE THEN 0
  ELSE pp.total::numeric * 100 / t.sum_total
END
FROM (
  SELECT x.product_id, SUM(x.total) AS sum_total
  FROM public.product_prizes x
  WHERE x.level NOT IN ('Last One', 'LAST ONE', 'last one', '最後賞')
    AND COALESCE(x.is_last_one, FALSE) = FALSE
  GROUP BY x.product_id
  HAVING SUM(x.total) > 0
) t
JOIN public.products p ON p.id = t.product_id
WHERE pp.product_id = t.product_id
  AND p.type IN ('gacha', 'blindbox');
