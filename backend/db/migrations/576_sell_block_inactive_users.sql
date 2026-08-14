-- 576_sell_block_inactive_users.sql
--
-- 上線盤查發現的洞：商城**沒有任何一層在看 users.status**。
-- 被停用／凍結的帳號照樣可以下單、加購物車、上架 —— 前台 AuthContext 的
-- 導向只是畫面行為，帶著舊 token 直接打 RPC 就繞過去了。
--
-- 用 trigger 而不是改寫 RPC：入口不只 sell_create_order 一支
-- （之後還會加），擋在資料表這一層才不會有人新開一條路就漏掉。

BEGIN;

CREATE OR REPLACE FUNCTION public.sell_assert_user_active(p_user uuid, p_role text)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_status text;
BEGIN
  IF p_user IS NULL THEN RETURN; END IF;
  SELECT status INTO v_status FROM public.users WHERE id = p_user;
  -- status 為 NULL 視同正常：舊帳號沒有這個欄位值，不能因為補欄位就全站停權
  IF v_status IS NOT NULL AND v_status <> 'active' THEN
    IF p_role = 'buyer' THEN
      RAISE EXCEPTION '你的帳號目前無法交易，請聯繫客服';
    ELSE
      RAISE EXCEPTION '賣家帳號目前無法接單';
    END IF;
  END IF;
END;
$$;

-- ① 下單：買賣雙方都要是正常帳號，賣家還要沒被商城停權
CREATE OR REPLACE FUNCTION public.sell_guard_order_parties()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.sell_assert_user_active(NEW.buyer_id, 'buyer');
  PERFORM public.sell_assert_user_active(NEW.seller_id, 'seller');
  IF EXISTS (SELECT 1 FROM public.sell_seller_profiles p
             WHERE p.seller_id = NEW.seller_id AND p.suspended_at IS NOT NULL) THEN
    RAISE EXCEPTION '賣家目前無法接單';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sell_guard_order_parties ON public.sell_orders;
CREATE TRIGGER trg_sell_guard_order_parties
  BEFORE INSERT ON public.sell_orders
  FOR EACH ROW EXECUTE FUNCTION public.sell_guard_order_parties();

-- ② 上架：停用的帳號不能再放新商品上來
CREATE OR REPLACE FUNCTION public.sell_guard_listing_owner()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  -- 官方商品的 seller 是平台帳號，不走這個把關
  IF COALESCE(NEW.is_official, false) THEN RETURN NEW; END IF;
  PERFORM public.sell_assert_user_active(NEW.seller_id, 'seller');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sell_guard_listing_owner ON public.sell_listings;
CREATE TRIGGER trg_sell_guard_listing_owner
  BEFORE INSERT ON public.sell_listings
  FOR EACH ROW EXECUTE FUNCTION public.sell_guard_listing_owner();

-- ③ 購物車：擋在加入的當下，比讓他挑完到結帳才被打回來好
CREATE OR REPLACE FUNCTION public.sell_guard_cart_owner()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.sell_assert_user_active(NEW.user_id, 'buyer');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sell_guard_cart_owner ON public.sell_cart;
CREATE TRIGGER trg_sell_guard_cart_owner
  BEFORE INSERT ON public.sell_cart
  FOR EACH ROW EXECUTE FUNCTION public.sell_guard_cart_owner();

-- ④ 停權賣家的商品要一起下架，不然買家還看得到、點進去才被擋
CREATE OR REPLACE FUNCTION public.sell_hide_suspended_listings()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.suspended_at IS NOT NULL AND COALESCE(OLD.suspended_at, NULL) IS NULL THEN
    UPDATE public.sell_listings SET status = 'off', updated_at = NOW()
    WHERE seller_id = NEW.seller_id AND status = 'active';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sell_hide_suspended_listings ON public.sell_seller_profiles;
CREATE TRIGGER trg_sell_hide_suspended_listings
  AFTER UPDATE ON public.sell_seller_profiles
  FOR EACH ROW EXECUTE FUNCTION public.sell_hide_suspended_listings();

COMMIT;
