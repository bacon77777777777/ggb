-- 510: public_product_promotions 補 name 欄
--
-- 商品資訊要顯示「促銷：開學買五送一」—— 那是 promotions.name，
-- 495 的 view 只帶了 badge_text（商品卡角落的短標）。
-- get_product_promotion 本來就回傳 name，view 選出來就好。

-- CREATE OR REPLACE 不能在中間插欄位（欄位順序視為改名），需先 DROP 重建
DROP VIEW IF EXISTS public.public_product_promotions;
CREATE VIEW public.public_product_promotions AS
SELECT
  p.id AS product_id,
  pr.id AS promotion_id,
  pr.name,
  pr.badge_text,
  pr.config,
  pr.type
FROM public.products p
CROSS JOIN LATERAL (
  SELECT * FROM public.get_product_promotion(p.id)
) pr;

GRANT SELECT ON public.public_product_promotions TO anon, authenticated;
