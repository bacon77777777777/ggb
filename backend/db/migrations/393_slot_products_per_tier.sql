-- 393: 機台品項庫改為「每主題×每檔次一個商品」
-- 商品名稱 = 主題名稱(檔次)，例：絕頂RUSH(10)；展開品項即該檔次 RUSH 獎池。
-- 品項按獎池 min_bet 歸入對應檔次商品（min_bet NULL 歸最小檔次）；
-- 補 product_code（10000000+id）；搬移後刪除 392 建立的單一品項庫商品。

BEGIN;

-- 1. 每主題 × 每檔次建商品
INSERT INTO public.products (name, type, status, is_active, price, total_count, remaining, supplier_id, description)
SELECT
  t.name || '(' || (tier->>'coins') || ')',
  'slot',
  'pending',
  FALSE,
  0, 0, 0,
  t.supplier_id,
  '挑戰機台 ' || (tier->>'coins') || 'G 檔獎池品項（由機台系統使用，請勿上架）'
FROM public.slot_themes t,
     jsonb_array_elements(t.bet_tiers) AS tier
WHERE NOT EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.type = 'slot' AND p.name = t.name || '(' || (tier->>'coins') || ')'
);

-- 2. 品項 → 檔次對應（依獎池 min_bet；NULL 或無獎池引用 → 該主題最小檔次）
CREATE TEMP TABLE tmp_tier_map ON COMMIT DROP AS
WITH prize_pool AS (
  SELECT DISTINCT ON (pp.id)
    pp.id AS pp_id,
    m.theme_id,
    spi.min_bet
  FROM public.product_prizes pp
  JOIN public.products old ON old.id = pp.product_id
   AND old.type = 'slot' AND old.name LIKE '%機台品項庫'
  LEFT JOIN public.slot_pool_items spi ON spi.product_prize_id = pp.id
  LEFT JOIN public.slot_machines m ON m.id = spi.machine_id
  ORDER BY pp.id, spi.min_bet NULLS LAST
)
SELECT
  x.pp_id,
  np.id AS new_product_id
FROM (
  SELECT
    p.pp_id,
    COALESCE(p.theme_id, (SELECT id FROM public.slot_themes ORDER BY id LIMIT 1)) AS theme_id,
    p.min_bet
  FROM prize_pool p
) x
JOIN public.slot_themes t ON t.id = x.theme_id
JOIN public.products np
  ON np.type = 'slot'
 AND np.name = t.name || '(' || COALESCE(
       x.min_bet::text,
       (SELECT MIN((e->>'coins')::bigint) FROM jsonb_array_elements(t.bet_tiers) e)::text
     ) || ')';

-- 3. 搬移品項
UPDATE public.product_prizes pp
SET product_id = tm.new_product_id
FROM tmp_tier_map tm
WHERE pp.id = tm.pp_id;

-- 4. 既有抽獎紀錄的 product_id 同步指向新檔次商品
UPDATE public.draw_records dr
SET product_id = pp.product_id
FROM public.product_prizes pp
WHERE dr.product_prize_id = pp.id
  AND dr.product_id IN (
    SELECT id FROM public.products WHERE type = 'slot' AND name LIKE '%機台品項庫'
  );

-- 5. 檔次商品庫存欄位同步（顯示用）+ 編號補齊
UPDATE public.products p
SET total_count = s.tot, remaining = s.rem
FROM (
  SELECT product_id, SUM(total) AS tot, SUM(remaining) AS rem
  FROM public.product_prizes
  GROUP BY product_id
) s
WHERE p.id = s.product_id AND p.type = 'slot';

UPDATE public.products
SET product_code = (10000000 + id)::text
WHERE type = 'slot' AND (product_code IS NULL OR btrim(product_code) = '');

-- 6. 刪除 392 的單一品項庫商品（品項已全數搬出才刪）
DELETE FROM public.products p
WHERE p.type = 'slot' AND p.name LIKE '%機台品項庫'
  AND NOT EXISTS (SELECT 1 FROM public.product_prizes pp WHERE pp.product_id = p.id);

COMMIT;
