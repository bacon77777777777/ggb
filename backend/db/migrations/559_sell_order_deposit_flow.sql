-- 559_sell_order_deposit_flow.sql
--
-- 把 558 的保證金接進訂單流程，並讓運費真的進到金額裡。
--
-- 保證金在流程中的四個轉折：
--   下單        create_sell_order          → 收（賣家 G幣扣起來）
--   買家取消    cancel_sell_order          → 退（還沒開始出貨，賣家沒有過錯）
--   付款逾時    sell_run_order_expiry ①    → 退（是買家沒付錢，不能罰賣家）
--   出貨逾時    sell_order_claim_compensation → 賠（買家主動申訴才賠）
--   確認收貨    sell_order_confirm_received → 退
--   收貨逾時    sell_run_order_expiry ③    → 退（自動結案視同完成）
--
-- ⚠️ 出貨逾時刻意**不自動沒收**。逾時一小時就自動罰錢，對只是晚一天出貨的
-- 賣家太重，而且東西可能已經在路上。改成逾時先通知（原本就有），
-- 買家覺得拿不到貨了才自己按下申訴 —— 由受害的一方決定，平台不越俎代庖。

BEGIN;

-- ============================================================
-- A. 上架守則加一條：單件售價上限依等級
-- ============================================================
-- 新手可以開價 6 萬收了錢就跑，保證金只押得到 3,000（新手 100% 但上限低），
-- 平台賠不起。上限跟著等級走，賣得多才解鎖高價品。

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
  v_tier        jsonb;
  v_max_price   int;
  v_top_price   int;
BEGIN
  IF public.sell_is_privileged() THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.sell_seller_profiles
    WHERE seller_id = NEW.seller_id AND suspended_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION '帳號已被停權，無法上架商品';
  END IF;

  SELECT COALESCE(value::jsonb, '[]'::jsonb) INTO v_whitelist
  FROM public.platform_settings WHERE key = 'sell_category_whitelist';

  IF NEW.category IS NULL OR btrim(NEW.category) = '' THEN
    RAISE EXCEPTION '請選擇商品類別';
  END IF;
  IF NOT (NEW.category IN (SELECT jsonb_array_elements_text(COALESCE(v_whitelist, '[]'::jsonb)))) THEN
    RAISE EXCEPTION '這個類別不開放販售';
  END IF;

  -- 售價上限：看所有規格裡最貴的那個
  v_tier      := public.sell_seller_tier(NEW.seller_id);
  v_max_price := COALESCE((v_tier ->> 'max_price')::int, 3000);

  SELECT COALESCE(MAX(COALESCE(NULLIF(e ->> 'price', '')::int, 0)), 0) INTO v_top_price
  FROM jsonb_array_elements(COALESCE(NEW.items, '[]'::jsonb)) AS e;
  v_top_price := GREATEST(v_top_price, COALESCE(NEW.price, 0));

  IF v_top_price > v_max_price THEN
    RAISE EXCEPTION '你目前是「%」賣家，單件最高可賣 % 元。多完成幾筆交易升級後就能解鎖',
      COALESCE(v_tier ->> 'name', '新手'), v_max_price;
  END IF;

  IF COALESCE(NEW.shipping_fee, 0) < 0 THEN
    RAISE EXCEPTION '運費不能是負數';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT COALESCE(value, 'true') = 'true' INTO v_user_listing
    FROM public.platform_settings WHERE key = 'sell_user_listing_enabled';

    IF NOT COALESCE(v_user_listing, true) THEN
      RAISE EXCEPTION '商城目前只提供官方商品，暫不開放玩家上架';
    END IF;

    SELECT COALESCE(value, 'true') = 'true' INTO v_need_phone
    FROM public.platform_settings WHERE key = 'sell_require_phone_verified';

    IF COALESCE(v_need_phone, true)
       AND NOT COALESCE((SELECT is_phone_verified FROM public.users WHERE id = NEW.seller_id), false) THEN
      RAISE EXCEPTION '請先完成手機驗證才能上架商品';
    END IF;

    SELECT COALESCE(NULLIF(value, '')::int, 20) INTO v_max_active
    FROM public.platform_settings WHERE key = 'sell_max_active_listings';

    SELECT count(*) INTO v_active_cnt
    FROM public.sell_listings
    WHERE seller_id = NEW.seller_id AND status IN ('pending','active');

    IF v_active_cnt >= COALESCE(v_max_active, 20) THEN
      RAISE EXCEPTION '上架數量已達上限（%），請先下架部分商品', COALESCE(v_max_active, 20);
    END IF;

    NEW.status      := 'pending';
    NEW.reviewed_at := NULL;
    NEW.reviewed_by := NULL;
    NEW.review_note := NULL;
    RETURN NEW;
  END IF;

  NEW.reviewed_at := OLD.reviewed_at;
  NEW.reviewed_by := OLD.reviewed_by;
  NEW.review_note := OLD.review_note;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      NEW.status = 'removed'
      OR (NEW.status = 'pending' AND OLD.status IN ('rejected','removed'))
    ) THEN
      RAISE EXCEPTION '不能自行變更上架狀態';
    END IF;
  END IF;

  IF OLD.status IN ('active','sold')
     AND NEW.status = OLD.status
     AND (
          NEW.title        IS DISTINCT FROM OLD.title
       OR NEW.note         IS DISTINCT FROM OLD.note
       OR NEW.price        IS DISTINCT FROM OLD.price
       OR NEW.images       IS DISTINCT FROM OLD.images
       OR NEW.items        IS DISTINCT FROM OLD.items
       OR NEW.category     IS DISTINCT FROM OLD.category
       OR NEW.shipping_fee IS DISTINCT FROM OLD.shipping_fee
     ) THEN
    NEW.status      := 'pending';
    NEW.reviewed_at := NULL;
    NEW.reviewed_by := NULL;
    NEW.review_note := NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- B. 下單：收保證金 + 運費快照
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_sell_order(
  p_listing_id bigint, p_item_index integer, p_quantity integer, p_payment_method text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_buyer_id   UUID;
  v_listing    RECORD;
  v_profile    RECORD;
  v_items      JSONB;
  v_item       JSONB;
  v_len        INTEGER;
  v_available  INTEGER;
  v_new_qty    INTEGER;
  v_unit_price INTEGER;
  v_method     TEXT;
  v_order_id   BIGINT;
  v_all_sold   BOOLEAN;
  v_goods      INTEGER;
  v_ship       INTEGER;
  v_deposit    INTEGER;
BEGIN
  v_buyer_id := auth.uid();
  IF v_buyer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '請先登入');
  END IF;

  IF p_quantity IS NULL OR p_quantity < 1 THEN
    RETURN jsonb_build_object('success', false, 'message', '購買數量不正確');
  END IF;

  SELECT * INTO v_listing FROM public.sell_listings
  WHERE id = p_listing_id AND status = 'active' FOR UPDATE;

  IF v_listing IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '這件商品已經不在架上了');
  END IF;

  IF v_listing.seller_id = v_buyer_id THEN
    RETURN jsonb_build_object('success', false, 'message', '不能購買自己的商品');
  END IF;

  SELECT * INTO v_profile FROM public.sell_seller_profiles
  WHERE seller_id = v_listing.seller_id;

  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '賣家尚未設定收款方式，暫時無法下單');
  END IF;

  IF v_profile.suspended_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '這位賣家目前無法交易');
  END IF;

  v_method := COALESCE(v_profile.payout_method, 'bank');
  IF v_method = 'bank' THEN
    IF COALESCE(btrim(v_profile.transfer_bank), '') = ''
       OR COALESCE(btrim(v_profile.transfer_account), '') = '' THEN
      RETURN jsonb_build_object('success', false, 'message', '賣家尚未填寫收款帳戶，暫時無法下單');
    END IF;
  ELSIF v_method = 'linepay' THEN
    IF COALESCE(btrim(v_profile.linepay_id), '') = '' THEN
      RETURN jsonb_build_object('success', false, 'message', '賣家尚未填寫 LINE Pay 收款資訊，暫時無法下單');
    END IF;
  ELSE
    RETURN jsonb_build_object('success', false, 'message', '賣家的收款方式設定有誤');
  END IF;

  v_items := COALESCE(v_listing.items, '[]'::jsonb);
  IF jsonb_typeof(v_items) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'message', '商品規格設定有誤');
  END IF;

  v_len := jsonb_array_length(v_items);
  IF p_item_index IS NULL OR p_item_index < 0 OR p_item_index >= v_len THEN
    RETURN jsonb_build_object('success', false, 'message', '找不到這個規格');
  END IF;

  v_item      := v_items -> p_item_index;
  v_available := COALESCE(NULLIF((v_item ->> 'quantity'), '')::int, 0);
  IF v_available < p_quantity THEN
    RETURN jsonb_build_object('success', false, 'message', '庫存不足');
  END IF;

  v_unit_price := COALESCE(NULLIF((v_item ->> 'price'), '')::int, v_listing.price, 0);
  IF v_unit_price <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', '商品金額設定有誤');
  END IF;

  v_goods := v_unit_price * p_quantity;
  v_ship  := COALESCE(v_listing.shipping_fee, 0);

  v_new_qty := v_available - p_quantity;
  v_items   := jsonb_set(v_items, ARRAY[p_item_index::text, 'quantity'], to_jsonb(v_new_qty), true);

  UPDATE public.sell_listings SET items = v_items, updated_at = NOW() WHERE id = p_listing_id;

  SELECT NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_items) AS e
    WHERE COALESCE(NULLIF((e->>'quantity'), '')::int, 0) > 0
  ) INTO v_all_sold;

  IF v_all_sold THEN
    UPDATE public.sell_listings SET status = 'sold', updated_at = NOW() WHERE id = p_listing_id;
  END IF;

  INSERT INTO public.sell_orders (
    listing_id, seller_id, buyer_id, item_index, quantity,
    unit_price, shipping_fee, payment_method, payment_status, step, cancelled
  ) VALUES (
    p_listing_id, v_listing.seller_id, v_buyer_id, p_item_index, p_quantity,
    v_unit_price, v_ship, v_method, 'unpaid', 1, false
  ) RETURNING id INTO v_order_id;

  -- 保證金：扣不到就整筆回滾，不能讓沒有保障的訂單成立
  v_deposit := public.sell_deposit_for(v_listing.seller_id, v_goods);
  IF NOT public.sell_deposit_charge(v_order_id, v_listing.seller_id, v_buyer_id, v_deposit) THEN
    -- 對買家不揭露賣家餘額，那是別人的財務狀況
    RAISE EXCEPTION 'SELL_DEPOSIT_INSUFFICIENT';
  END IF;

  UPDATE public.sell_orders SET deposit_amount = v_deposit WHERE id = v_order_id;

  INSERT INTO public.sell_messages (listing_id, sender_id, receiver_id, kind, body)
  VALUES (p_listing_id, v_buyer_id, v_listing.seller_id, 'system', '已建立訂單');

  RETURN jsonb_build_object(
    'success', true, 'order_id', v_order_id, 'payment_method', v_method,
    'goods_amount', v_goods, 'shipping_fee', v_ship,
    'total_amount', v_goods + v_ship, 'deposit', v_deposit
  );
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM = 'SELL_DEPOSIT_INSUFFICIENT' THEN
      RETURN jsonb_build_object('success', false, 'message', '賣家目前無法接單，請稍後再試');
    END IF;
    RAISE;
END;
$$;

-- ============================================================
-- C. 取消 / 確認收貨 → 退保證金
-- ============================================================

CREATE OR REPLACE FUNCTION public.cancel_sell_order(p_order_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_uid       UUID;
  v_order     RECORD;
  v_listing   RECORD;
  v_items     JSONB;
  v_item      JSONB;
  v_available INTEGER;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '請先登入');
  END IF;

  SELECT * INTO v_order FROM public.sell_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '找不到這筆訂單');
  END IF;
  IF v_order.cancelled THEN
    RETURN jsonb_build_object('success', true, 'message', '訂單已經取消了');
  END IF;
  IF v_order.step <> 1 THEN
    RETURN jsonb_build_object('success', false, 'message', '已經付款的訂單不能直接取消，請與對方聯繫');
  END IF;
  IF v_order.buyer_id <> v_uid AND v_order.seller_id <> v_uid THEN
    RETURN jsonb_build_object('success', false, 'message', '沒有權限');
  END IF;

  SELECT * INTO v_listing FROM public.sell_listings WHERE id = v_order.listing_id FOR UPDATE;

  v_items     := COALESCE(v_listing.items, '[]'::jsonb);
  v_item      := v_items -> v_order.item_index;
  v_available := COALESCE(NULLIF((v_item ->> 'quantity'), '')::int, 0);
  v_items     := jsonb_set(v_items, ARRAY[v_order.item_index::text, 'quantity'],
                           to_jsonb(v_available + v_order.quantity), true);

  UPDATE public.sell_listings
  SET items = v_items,
      status = CASE WHEN status = 'sold' THEN 'active' ELSE status END,
      updated_at = NOW()
  WHERE id = v_listing.id;

  UPDATE public.sell_orders
  SET cancelled = true, cancel_reason = 'cancelled', updated_at = NOW()
  WHERE id = v_order.id;

  -- 還沒進出貨階段，賣家沒有過錯 → 退保證金
  PERFORM public.sell_deposit_release(p_order_id, '訂單取消');

  INSERT INTO public.sell_messages (listing_id, sender_id, receiver_id, kind, body)
  VALUES (v_listing.id, v_uid,
          CASE WHEN v_uid = v_order.buyer_id THEN v_order.seller_id ELSE v_order.buyer_id END,
          'system', '訂單已取消');

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.sell_order_confirm_received(p_order_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_uid UUID;
  v_order RECORD;
  v_seller UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'login_required');
  END IF;

  SELECT * INTO v_order FROM public.sell_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'order_not_found');
  END IF;
  IF v_order.cancelled THEN
    RETURN jsonb_build_object('success', false, 'message', 'cancelled');
  END IF;
  IF v_order.buyer_id <> v_uid THEN
    RETURN jsonb_build_object('success', false, 'message', 'forbidden');
  END IF;
  IF v_order.step <> 4 THEN
    RETURN jsonb_build_object('success', false, 'message', 'invalid_step');
  END IF;

  v_seller := v_order.seller_id;

  UPDATE public.sell_orders
  SET step = 5, received_at = NOW(), completed_at = NOW(), updated_at = NOW()
  WHERE id = p_order_id;

  PERFORM public.sell_deposit_release(p_order_id, '買家確認收貨');

  INSERT INTO public.sell_messages (listing_id, sender_id, receiver_id, kind, body)
  VALUES (v_order.listing_id, v_uid, v_seller, 'system', '買家已確認收貨，交易完成');

  INSERT INTO public.notifications (user_id, type, title, body, link, meta)
  VALUES (v_seller, 'sell_order', '商城訂單',
          '買家已確認收貨，保證金已退還',
          '/sell-orders/' || p_order_id::text,
          jsonb_build_object('order_id', p_order_id, 'listing_id', v_order.listing_id, 'buyer_id', v_uid));

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ============================================================
-- D. 買家申訴：出貨逾時請求補償
-- ============================================================
-- 由買家主動按，不自動執行 —— 見檔頭說明。

CREATE OR REPLACE FUNCTION public.sell_order_claim_compensation(p_order_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_uid       UUID;
  v_order     RECORD;
  v_ship_days int;
  v_amount    int;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '請先登入');
  END IF;

  SELECT * INTO v_order FROM public.sell_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '找不到這筆訂單');
  END IF;
  IF v_order.buyer_id <> v_uid THEN
    RETURN jsonb_build_object('success', false, 'message', '沒有權限');
  END IF;
  IF v_order.cancelled THEN
    RETURN jsonb_build_object('success', false, 'message', '這筆訂單已經結束了');
  END IF;
  IF v_order.step <> 3 THEN
    RETURN jsonb_build_object('success', false, 'message', '這筆訂單目前不能申訴');
  END IF;

  SELECT COALESCE(NULLIF(value,'')::int, 7) INTO v_ship_days
  FROM public.platform_settings WHERE key = 'sell_ship_deadline_days';

  IF COALESCE(v_order.seller_confirmed_at, v_order.created_at)
     >= NOW() - make_interval(days => COALESCE(v_ship_days, 7)) THEN
    RETURN jsonb_build_object('success', false, 'message', '還沒超過出貨期限，再等等賣家');
  END IF;

  SELECT amount INTO v_amount FROM public.sell_deposits
  WHERE order_id = p_order_id AND status = 'locked';

  IF v_amount IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '這筆訂單沒有可補償的保證金');
  END IF;

  PERFORM public.sell_deposit_forfeit(p_order_id, '買家申訴：賣家逾時未出貨');

  UPDATE public.sell_orders
  SET cancelled = true, cancel_reason = 'ship_timeout', updated_at = NOW()
  WHERE id = p_order_id;

  INSERT INTO public.sell_messages (listing_id, sender_id, receiver_id, kind, body)
  VALUES (v_order.listing_id, v_uid, v_order.seller_id, 'system',
          '買家已申訴逾時未出貨，保證金已賠付給買家');

  RETURN jsonb_build_object('success', true, 'compensation', v_amount);
END;
$$;

-- ============================================================
-- E. 逾時排程：付款逾時與自動結案都要處理保證金
-- ============================================================

CREATE OR REPLACE FUNCTION public.sell_run_order_expiry()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pay_hours     int;
  v_ship_days     int;
  v_receive_days  int;
  v_cancelled     int := 0;
  v_flagged       int := 0;
  v_completed     int := 0;
  r               RECORD;
  v_items         JSONB;
  v_item          JSONB;
BEGIN
  SELECT COALESCE(NULLIF(value,'')::int, 48) INTO v_pay_hours
  FROM public.platform_settings WHERE key = 'sell_pay_deadline_hours';
  SELECT COALESCE(NULLIF(value,'')::int, 7) INTO v_ship_days
  FROM public.platform_settings WHERE key = 'sell_ship_deadline_days';
  SELECT COALESCE(NULLIF(value,'')::int, 7) INTO v_receive_days
  FROM public.platform_settings WHERE key = 'sell_receive_deadline_days';

  v_pay_hours    := COALESCE(v_pay_hours, 48);
  v_ship_days    := COALESCE(v_ship_days, 7);
  v_receive_days := COALESCE(v_receive_days, 7);

  -- ① 逾時未付款 → 取消、回補庫存、退保證金（錯不在賣家）
  FOR r IN
    SELECT * FROM public.sell_orders
    WHERE cancelled = false AND step = 1
      AND created_at < NOW() - make_interval(hours => v_pay_hours)
    ORDER BY id FOR UPDATE SKIP LOCKED
  LOOP
    SELECT COALESCE(items, '[]'::jsonb) INTO v_items
    FROM public.sell_listings WHERE id = r.listing_id FOR UPDATE;

    v_item  := v_items -> r.item_index;
    v_items := jsonb_set(v_items, ARRAY[r.item_index::text, 'quantity'],
                 to_jsonb(COALESCE(NULLIF((v_item ->> 'quantity'), '')::int, 0) + r.quantity), true);

    UPDATE public.sell_listings
    SET items = v_items,
        status = CASE WHEN status = 'sold' THEN 'active' ELSE status END,
        updated_at = NOW()
    WHERE id = r.listing_id;

    UPDATE public.sell_orders
    SET cancelled = true, cancel_reason = 'payment_timeout', updated_at = NOW()
    WHERE id = r.id;

    PERFORM public.sell_deposit_release(r.id, '買家逾時未付款');

    INSERT INTO public.sell_messages (listing_id, sender_id, receiver_id, kind, body)
    VALUES (r.listing_id, r.seller_id, r.buyer_id, 'system',
            '超過付款期限，訂單已自動取消');

    v_cancelled := v_cancelled + 1;
  END LOOP;

  -- ② 逾時未出貨 → 通知並告知可申訴（保證金不在這裡動，等買家決定）
  FOR r IN
    SELECT * FROM public.sell_orders
    WHERE cancelled = false AND step = 3
      AND overdue_notified_at IS NULL
      AND COALESCE(seller_confirmed_at, created_at) < NOW() - make_interval(days => v_ship_days)
    ORDER BY id FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.sell_orders SET overdue_notified_at = NOW(), updated_at = NOW() WHERE id = r.id;

    INSERT INTO public.sell_messages (listing_id, sender_id, receiver_id, kind, body)
    VALUES (r.listing_id, r.buyer_id, r.seller_id, 'system',
            '這筆訂單已超過出貨期限，請盡快處理，否則保證金會賠付給買家');
    INSERT INTO public.sell_messages (listing_id, sender_id, receiver_id, kind, body)
    VALUES (r.listing_id, r.seller_id, r.buyer_id, 'system',
            '賣家已超過出貨期限。你可以在訂單頁申請補償，領取賣家的保證金');

    INSERT INTO public.notifications (user_id, type, title, body, link, meta)
    VALUES (r.buyer_id, 'sell_order', '商城訂單',
            '賣家超過出貨期限，你可以申請補償',
            '/sell-orders/' || r.id::text,
            jsonb_build_object('order_id', r.id, 'claimable', true));

    v_flagged := v_flagged + 1;
  END LOOP;

  -- ③ 逾時未確認收貨 → 自動結案並退保證金（視同完成）
  FOR r IN
    SELECT * FROM public.sell_orders
    WHERE cancelled = false AND step = 4
      AND COALESCE(shipped_at, created_at) < NOW() - make_interval(days => v_receive_days)
    ORDER BY id FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.sell_orders
    SET step = 5, received_at = COALESCE(received_at, NOW()),
        completed_at = NOW(), updated_at = NOW()
    WHERE id = r.id;

    PERFORM public.sell_deposit_release(r.id, '超過確認收貨期限，自動完成');

    INSERT INTO public.sell_messages (listing_id, sender_id, receiver_id, kind, body)
    VALUES (r.listing_id, r.seller_id, r.buyer_id, 'system',
            '超過確認收貨期限，訂單已自動完成');

    v_completed := v_completed + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'cancelled_unpaid', v_cancelled,
    'flagged_unshipped', v_flagged,
    'auto_completed',    v_completed
  );
END;
$$;

COMMIT;
