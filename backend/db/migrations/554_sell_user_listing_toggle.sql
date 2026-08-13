-- 554_sell_user_listing_toggle.sql
--
-- 商城設定：「用戶自由上架」開關。
--
-- 關掉之後，玩家不能自己上架，商城只剩官方（GGB 自售）的商品。
-- 這是老闆要在後台「商城設定」頁控制的東西 —— 開放 C2C 是有風險的決定，
-- 要能一鍵收回，不必等改程式或推版。
--
-- 為什麼擋在 trigger 而不是只藏前台按鈕：
-- 前台按鈕藏起來，會打 API 的人照樣能 insert。這個開關擋的是真的上架動作。
-- 後台（service_role）與站內函式不受影響 —— 官方商品要照上。

BEGIN;

INSERT INTO public.platform_settings (key, value)
VALUES ('sell_user_listing_enabled', 'true')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.sell_guard_listing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_whitelist   jsonb;
  v_need_phone  boolean;
  v_user_listing boolean;
  v_max_active  int;
  v_active_cnt  int;
BEGIN
  IF public.sell_is_privileged() THEN
    RETURN NEW;
  END IF;

  -- 停權的賣家什麼都不能做
  IF EXISTS (
    SELECT 1 FROM public.sell_seller_profiles
    WHERE seller_id = NEW.seller_id AND suspended_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION '帳號已被停權，無法上架商品';
  END IF;

  -- 類別必須在白名單內
  SELECT COALESCE(value::jsonb, '[]'::jsonb) INTO v_whitelist
  FROM public.platform_settings WHERE key = 'sell_category_whitelist';

  IF NEW.category IS NULL OR btrim(NEW.category) = '' THEN
    RAISE EXCEPTION '請選擇商品類別';
  END IF;
  IF NOT (NEW.category IN (SELECT jsonb_array_elements_text(COALESCE(v_whitelist, '[]'::jsonb)))) THEN
    RAISE EXCEPTION '這個類別不開放販售';
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- 用戶自由上架總開關
    SELECT COALESCE(value, 'true') = 'true' INTO v_user_listing
    FROM public.platform_settings WHERE key = 'sell_user_listing_enabled';

    IF NOT COALESCE(v_user_listing, true) THEN
      RAISE EXCEPTION '商城目前只提供官方商品，暫不開放玩家上架';
    END IF;

    -- 手機驗證：平台不碰錢，實名是唯一能追到人的手段
    SELECT COALESCE(value, 'true') = 'true' INTO v_need_phone
    FROM public.platform_settings WHERE key = 'sell_require_phone_verified';

    IF COALESCE(v_need_phone, true)
       AND NOT COALESCE((SELECT is_phone_verified FROM public.users WHERE id = NEW.seller_id), false) THEN
      RAISE EXCEPTION '請先完成手機驗證才能上架商品';
    END IF;

    -- 上架則數上限，避免洗版
    SELECT COALESCE(NULLIF(value, '')::int, 20) INTO v_max_active
    FROM public.platform_settings WHERE key = 'sell_max_active_listings';

    SELECT count(*) INTO v_active_cnt
    FROM public.sell_listings
    WHERE seller_id = NEW.seller_id AND status IN ('pending','active');

    IF v_active_cnt >= COALESCE(v_max_active, 20) THEN
      RAISE EXCEPTION '上架數量已達上限（%），請先下架部分商品', COALESCE(v_max_active, 20);
    END IF;

    -- 玩家自己上架一律進待審，審核欄位不給帶
    NEW.status      := 'pending';
    NEW.reviewed_at := NULL;
    NEW.reviewed_by := NULL;
    NEW.review_note := NULL;
    RETURN NEW;
  END IF;

  -- ── 以下是 UPDATE ──

  -- 審核結果不給賣家碰
  NEW.reviewed_at := OLD.reviewed_at;
  NEW.reviewed_by := OLD.reviewed_by;
  NEW.review_note := OLD.review_note;

  -- 狀態只能：自行下架，或把被退回／已下架的重新送審
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      NEW.status = 'removed'
      OR (NEW.status = 'pending' AND OLD.status IN ('rejected','removed'))
    ) THEN
      RAISE EXCEPTION '不能自行變更上架狀態';
    END IF;
  END IF;

  -- 防換餌：上架後改內容要重新送審。
  IF OLD.status IN ('active','sold')
     AND NEW.status = OLD.status
     AND (
          NEW.title    IS DISTINCT FROM OLD.title
       OR NEW.note     IS DISTINCT FROM OLD.note
       OR NEW.price    IS DISTINCT FROM OLD.price
       OR NEW.images   IS DISTINCT FROM OLD.images
       OR NEW.items    IS DISTINCT FROM OLD.items
       OR NEW.category IS DISTINCT FROM OLD.category
     ) THEN
    NEW.status      := 'pending';
    NEW.reviewed_at := NULL;
    NEW.reviewed_by := NULL;
    NEW.review_note := NULL;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
