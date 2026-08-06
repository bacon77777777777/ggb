-- 495：前台要讀得到促銷才掛得出標籤
--
-- promotions 與 promotion_targets 是後台管的，但商品卡角落那個「買5送1」
-- 標籤是前台畫的 —— 前台得知道哪個商品有哪個方案。
--
-- 開一個 view 把「商品 → 標籤」直接算好，前台一次查完就好：
-- 讓前台自己 join promotions × targets × product_categories 再套優先權，
-- 等於把後端邏輯抄一份到瀏覽器，兩邊遲早會不一致。
CREATE OR REPLACE VIEW public.public_product_promotions AS
SELECT
  p.id AS product_id,
  pr.id AS promotion_id,
  pr.badge_text,
  pr.config,
  pr.type
FROM public.products p
CROSS JOIN LATERAL (
  SELECT * FROM public.get_product_promotion(p.id)
) pr;

GRANT SELECT ON public.public_product_promotions TO anon, authenticated;

COMMENT ON VIEW public.public_product_promotions IS
  '每個商品目前生效的促銷方案（已套用檔期與優先權）。前台掛標籤用。';
