-- 450: 封存後不可切換販售模式
--
-- 漏洞：商品先建成一般販售並上架（此時已排籤封存，籤數 = 各賞項加總），
-- 之後再編輯切成抽籤販售並設定「總抽獎次數 100」。
-- 但 ensure_lottery_blank_prize() 看到已封存就直接 return，落選籤補不進去，
-- 封存表仍是原本的籤數 —— 後台顯示 100 次，實際只有 N 次可抽，
-- 而且中籤率跟管理員設定的完全不同。
--
-- 抽籤販售必須從建立時就決定。封存後改模式一律擋下，錯誤訊息要講得夠清楚，
-- 不然管理員只會看到儲存失敗而不知道該怎麼辦。

CREATE OR REPLACE FUNCTION public.guard_sale_mode_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.sale_mode IS DISTINCT FROM OLD.sale_mode
     AND EXISTS (SELECT 1 FROM product_ticket_seals WHERE product_id = NEW.id) THEN
    RAISE EXCEPTION
      'PRODUCT_SEALED: 此商品已排籤封存，不可切換販售模式。抽籤販售請在建立商品時就選擇。';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_sale_mode ON public.products;
CREATE TRIGGER trg_guard_sale_mode
  BEFORE UPDATE OF sale_mode ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.guard_sale_mode_change();

COMMENT ON FUNCTION public.guard_sale_mode_change IS
  '封存後禁止切換販售模式：落選籤已補不進封存表，改了會讓設定與實際籤數不符。';
