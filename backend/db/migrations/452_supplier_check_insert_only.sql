-- 452: 449 的廠商 CHECK 會擋死既有商品的任何更新（線上事故修正）
--
-- 449 用 `CHECK (supplier_id IS NOT NULL) NOT VALID` 想達成
-- 「既有缺漏不擋、新寫入才擋」。但 NOT VALID 的語意是
-- 「建立當下不掃描既有列」，**不是**「既有列永遠豁免」——
-- 只要那一列被 UPDATE，約束就會生效。
--
-- 於是 PROD 上 supplier_id 為 NULL 的兩筆商品（#38、#39）變成完全動不了，
-- 而且不是「編輯時才發現」那麼溫和：
--
--   draw_records 有 trigger sync_product_sales()
--     → 每次抽獎後 UPDATE products SET sales = ...
--       → 撞上 CHECK → 整筆抽獎交易失敗
--
-- 也就是說 #39（custom、已有 72 筆抽獎的活商品）從 449 套用之後就抽不了。
--
-- 改用 BEFORE INSERT trigger：只擋新商品，既有列被 UPDATE 不受影響。
-- 「編輯時不能把廠商清掉」由後台表單驗證負責（449 已補），
-- 那層擋不到的只有直接寫 DB，而直接寫 DB 的情境是建資料不是改 sales。

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_supplier_required_chk;

CREATE OR REPLACE FUNCTION public.require_product_supplier()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.supplier_id IS NULL THEN
    RAISE EXCEPTION 'SUPPLIER_REQUIRED: 商品必須指定廠商（出貨以廠商為單位分批）';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_require_product_supplier ON public.products;
CREATE TRIGGER trg_require_product_supplier
  BEFORE INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.require_product_supplier();

COMMENT ON FUNCTION public.require_product_supplier IS
  '新商品必須指定廠商。只擋 INSERT —— 擋 UPDATE 會讓既有無廠商商品連 sales 統計都更新不了。';
