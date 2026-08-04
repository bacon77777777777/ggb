-- 436: 封存後的鎖定不該擋掉整個商品的刪除
--
-- 429 的 guard_sealed_product() 綁在 product_prizes 的 BEFORE DELETE 上，
-- 只要商品封存過就 RAISE。但 DELETE FROM products 會 CASCADE 到 product_prizes，
-- 於是「封存過的商品永遠刪不掉」：
--
--   ERROR: PRODUCT_SEALED: 此商品已封存排籤，賞項不可再異動
--   CONTEXT: SQL statement "DELETE FROM ONLY public.product_prizes WHERE ..."
--
-- 建錯一個商品、上架後才發現要重來，就會卡死在後台刪不掉，
-- 而錯誤訊息講的是「賞項不可異動」，完全指不到真正的原因。
--
-- 鎖定要防的是「承諾值公布後偷改內容」，不是「把整個商品下架刪除」——
-- 商品都不存在了，那份承諾也沒有對象了。
--
-- CASCADE 時 products 那列會先被刪掉，所以用「父商品還在不在」就能區分：
--   還在 → 是在單獨改／刪賞項 → 擋
--   不在 → 是整個商品被刪掉連帶清除 → 放行

CREATE OR REPLACE FUNCTION public.guard_sealed_product()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_product_id BIGINT := COALESCE(NEW.product_id, OLD.product_id);
BEGIN
  -- 父商品已經不在 = 整個商品被刪除的連帶清除，放行
  IF NOT EXISTS (SELECT 1 FROM products WHERE id = v_product_id) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF EXISTS (SELECT 1 FROM product_ticket_seals WHERE product_id = v_product_id) THEN
    RAISE EXCEPTION 'PRODUCT_SEALED: 此商品已封存排籤，賞項不可再異動（要重排請先刪除整個商品）';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.guard_sealed_product IS
  '封存後禁止異動賞項。整個商品被刪除時的 CASCADE 不在此限。';
