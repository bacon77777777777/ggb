-- 531: product_prizes.probability 精度兩環境對齊（STG numeric(5,2) → numeric(10,6)）
--
-- 匯入外站商品時發現的 schema 漂移：PROD 是 numeric(10,6)、STG 還停在 numeric(5,2)。
-- 515 修單位那次應該只跑了 PROD。
--
-- 為什麼 2 位小數不夠：抽卡商品一件常常上千張籤，單張卡的機率是
-- 1/1036 = 0.096525%。存成 2 位會變成 0.10，37 個品項加起來 100.13% ——
-- 前台配率表列出來就是「加起來不等於 100」，玩家看得到。
-- 品項再多一點（1/20000）甚至會直接進位成 0.00，變成「不可能中」。

ALTER TABLE public.product_prizes
  ALTER COLUMN probability TYPE numeric(10,6);

-- 精度改完後，把被 2 位小數截壞的資料按 516 的規則重算：
-- 機率 = 品項數量 ÷ 商品總數量 × 100，最後賞維持 0（觸發式，不進輪盤）。
--
-- 只動「加總已經對不上 100」的商品，沒壞的不碰（PROD 全部都是對的，等同 no-op）。
-- slot 不在名單內 —— 老虎機的權重看 slot_pool_items，不是這個欄位。
WITH broken AS (
  SELECT x.product_id, x.sum_total
  FROM (
    SELECT pp.product_id,
           SUM(pp.total) FILTER (
             WHERE NOT COALESCE(pp.is_last_one, FALSE)
               AND pp.level NOT IN ('Last One', 'LAST ONE', 'last one', '最後賞')
           ) AS sum_total,
           SUM(pp.probability) FILTER (
             WHERE NOT COALESCE(pp.is_last_one, FALSE)
               AND pp.level NOT IN ('Last One', 'LAST ONE', 'last one', '最後賞')
           ) AS sum_prob
    FROM public.product_prizes pp
    GROUP BY pp.product_id
  ) x
  JOIN public.products p ON p.id = x.product_id
  WHERE x.sum_total > 0
    AND ABS(x.sum_prob - 100) > 0.01
    AND p.type IN ('ichiban', 'gacha', 'blindbox', 'card', 'custom')
)
UPDATE public.product_prizes pp
SET probability = CASE
  WHEN pp.is_last_one = TRUE
    OR pp.level IN ('Last One', 'LAST ONE', 'last one', '最後賞') THEN 0
  ELSE pp.total::numeric * 100 / b.sum_total
END
FROM broken b
WHERE pp.product_id = b.product_id;
