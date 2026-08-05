-- 448: 商品編號改為自動產生
--
-- 編號的規則一直是 (10000000 + id)，但這件事只寫在 migration 393 的一次性
-- backfill 裡 —— 欄位沒有 default、沒有 trigger，新增商品的程式也沒補。
-- 所以 393 之後建立的商品全部沒有編號：
--   STG 8 筆（5 台機台 + 3 檔抽籤販售）、PROD 5 筆
-- 後台商品列表的「編號」欄就是空的，客服要對單也沒得對。
--
-- 這種「靠人記得補」的欄位遲早會再漏一次，改成 trigger 一次解決。
-- 用 BEFORE INSERT trigger 而不是 DEFAULT，是因為 DEFAULT 取不到同一列的 id
-- （id 是 BIGSERIAL，DEFAULT 運算時還沒有值）。

CREATE OR REPLACE FUNCTION public.set_product_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.product_code IS NULL OR NEW.product_code = '' THEN
    NEW.product_code := (10000000 + NEW.id)::text;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_product_code IS
  '商品編號 = 10000000 + id。沒帶就自動補，維持與既有 44 筆相同的規則。';

DROP TRIGGER IF EXISTS trg_set_product_code ON public.products;
CREATE TRIGGER trg_set_product_code
  BEFORE INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_product_code();

-- 補齊既有的空編號
UPDATE public.products
   SET product_code = (10000000 + id)::text
 WHERE product_code IS NULL OR product_code = '';
