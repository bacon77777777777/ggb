-- 573_sell_cart_and_minute_expiry.sql
--
-- 接線第二批（購買鏈）的 DB 面：
--   A. sell_cart 購物車（原型的購物車要跨裝置留著，不能只存在瀏覽器）
--   B. 付款倒數改「分鐘級」＝ 15 分鐘（ROADMAP 商業規則 2）
--   C. 待確認收款 15 分鐘自動進待出貨（規則 3）
--   D. ⚠️ 修 571 帶出來的破口：expiry 還在直接改 items 回補庫存
--
-- D 說明：571 之後 items 由 specs 單向推導（trg_sell_derive_items），
-- 舊的回補寫進 items 會在下一次 specs 異動時被推導整個蓋掉 ——
-- 帳面看起來補回來了，實際 specs（唯一真相）永遠少那一件，
-- 賣家會發現「訂單取消了但商品還是缺貨」。改呼叫 571 的 sell_restore_stock()。

BEGIN;

-- ============================================================
-- A. 購物車
-- ============================================================
--
-- 一列 = 一個規格品項（listing + 群組索引 + 品項索引），數量可累加。
-- 不存價格：價格以結帳當下的 specs 為準，購物車放久了賣家改價就該以新價成立。

CREATE TABLE IF NOT EXISTS public.sell_cart (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id  bigint NOT NULL REFERENCES public.sell_listings(id) ON DELETE CASCADE,
  group_index int NOT NULL DEFAULT 0,
  item_index  int NOT NULL DEFAULT 0,
  quantity    int NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at  timestamptz NOT NULL DEFAULT NOW(),
  updated_at  timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, listing_id, group_index, item_index)
);

CREATE INDEX IF NOT EXISTS sell_cart_user_idx ON public.sell_cart(user_id);

ALTER TABLE public.sell_cart ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sell cart - own all" ON public.sell_cart;
CREATE POLICY "Sell cart - own all" ON public.sell_cart
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 加入購物車：已存在就累加數量（原型按第二次是 +1，不是變成 1）
CREATE OR REPLACE FUNCTION public.sell_cart_add(
  p_listing_id bigint, p_group int DEFAULT 0, p_item int DEFAULT 0, p_qty int DEFAULT 1
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid(); v_stock int; v_have int;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', '請先登入'); END IF;
  IF COALESCE(p_qty, 0) <= 0 THEN RETURN jsonb_build_object('success', false, 'error', '數量不正確'); END IF;

  -- 自己的商品不給加：原型的賣場頁對自己的商品是顯示「編輯」而不是「加入購物車」
  IF EXISTS (SELECT 1 FROM public.sell_listings WHERE id = p_listing_id AND seller_id = v_uid) THEN
    RETURN jsonb_build_object('success', false, 'error', '這是你自己的商品');
  END IF;

  SELECT COALESCE(NULLIF(specs #>> ARRAY['o', p_group::text, 'items', p_item::text, 'q'], '')::int, 0)
  INTO v_stock FROM public.sell_listings WHERE id = p_listing_id AND status = 'active';

  IF v_stock IS NULL THEN RETURN jsonb_build_object('success', false, 'error', '商品已下架'); END IF;

  SELECT COALESCE(quantity, 0) INTO v_have FROM public.sell_cart
  WHERE user_id = v_uid AND listing_id = p_listing_id AND group_index = p_group AND item_index = p_item;

  -- 購物車不鎖庫存（鎖了會讓別人買不到），但也不讓它超過現有庫存
  IF COALESCE(v_have, 0) + p_qty > v_stock THEN
    RETURN jsonb_build_object('success', false, 'error', '庫存只剩 ' || v_stock || ' 件');
  END IF;

  INSERT INTO public.sell_cart (user_id, listing_id, group_index, item_index, quantity)
  VALUES (v_uid, p_listing_id, p_group, p_item, p_qty)
  ON CONFLICT (user_id, listing_id, group_index, item_index)
  DO UPDATE SET quantity = public.sell_cart.quantity + EXCLUDED.quantity, updated_at = NOW();

  RETURN jsonb_build_object('success', true,
    'count', (SELECT COALESCE(SUM(quantity), 0) FROM public.sell_cart WHERE user_id = v_uid));
END;
$$;

-- 改數量；p_qty <= 0 等同移除
CREATE OR REPLACE FUNCTION public.sell_cart_set_qty(
  p_listing_id bigint, p_group int, p_item int, p_qty int
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', '請先登入'); END IF;

  IF COALESCE(p_qty, 0) <= 0 THEN
    DELETE FROM public.sell_cart
    WHERE user_id = v_uid AND listing_id = p_listing_id AND group_index = p_group AND item_index = p_item;
  ELSE
    UPDATE public.sell_cart SET quantity = p_qty, updated_at = NOW()
    WHERE user_id = v_uid AND listing_id = p_listing_id AND group_index = p_group AND item_index = p_item;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 讀購物車：照賣場分組給前端（平台不碰錢，本來就得一個賣場結一次）
CREATE OR REPLACE FUNCTION public.sell_cart_list()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE(jsonb_agg(shop ORDER BY shop->>'seller_name'), '[]'::jsonb) FROM (
    SELECT jsonb_build_object(
      'seller_id', l.seller_id,
      'seller_name', COALESCE(u.name, '玩家'),
      'shipping_fee', MAX(l.shipping_fee),
      'items', jsonb_agg(jsonb_build_object(
        'cart_id', c.id, 'listing_id', l.id, 'title', l.title,
        'g', c.group_index, 'i', c.item_index,
        'spec_label', COALESCE(l.specs #>> ARRAY['o', c.group_index::text, 'v'], '')
                      || CASE WHEN l.specs #>> ARRAY['o', c.group_index::text, 'items', c.item_index::text, 'n'] IS NULL
                              THEN '' ELSE ' · ' || (l.specs #>> ARRAY['o', c.group_index::text, 'items', c.item_index::text, 'n']) END,
        'image', COALESCE(NULLIF(l.specs #>> ARRAY['o', c.group_index::text, 'items', c.item_index::text, 'img'], ''), (l.images)[1], ''),
        'price', COALESCE(NULLIF(l.specs #>> ARRAY['o', c.group_index::text, 'items', c.item_index::text, 'p'], '')::int, l.price),
        'stock', COALESCE(NULLIF(l.specs #>> ARRAY['o', c.group_index::text, 'items', c.item_index::text, 'q'], '')::int, 0),
        'qty', c.quantity,
        'available', (l.status = 'active')
      ) ORDER BY c.created_at)
    ) AS shop
    FROM public.sell_cart c
    JOIN public.sell_listings l ON l.id = c.listing_id
    LEFT JOIN public.users u ON u.id = l.seller_id
    WHERE c.user_id = auth.uid()
    GROUP BY l.seller_id, u.name
  ) t;
$$;

-- 結帳成功後清掉那些列（sell_create_order 不自己清，因為它也給「直接購買」用）
CREATE OR REPLACE FUNCTION public.sell_cart_clear(p_cart_ids bigint[])
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH d AS (
    DELETE FROM public.sell_cart
    WHERE user_id = auth.uid() AND id = ANY (COALESCE(p_cart_ids, '{}'))
    RETURNING 1
  )
  SELECT jsonb_build_object('success', true, 'removed', (SELECT COUNT(*) FROM d));
$$;

GRANT EXECUTE ON FUNCTION public.sell_cart_add(bigint,int,int,int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sell_cart_set_qty(bigint,int,int,int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sell_cart_list() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sell_cart_clear(bigint[]) TO authenticated;

-- ============================================================
-- B/C/D. 逾時處理改分鐘級 + 用 sell_restore_stock 回補
-- ============================================================

INSERT INTO public.platform_settings (key, value)
VALUES ('sell_pay_deadline_minutes', '15'), ('sell_confirm_deadline_minutes', '15')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.sell_run_order_expiry()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_pay_min       int;
  v_confirm_min   int;
  v_ship_days     int;
  v_receive_days  int;
  v_cancelled     int := 0;
  v_auto_conf     int := 0;
  v_flagged       int := 0;
  v_completed     int := 0;
  r               RECORD;
BEGIN
  SELECT COALESCE(NULLIF(value,'')::int, 15) INTO v_pay_min
  FROM public.platform_settings WHERE key = 'sell_pay_deadline_minutes';
  SELECT COALESCE(NULLIF(value,'')::int, 15) INTO v_confirm_min
  FROM public.platform_settings WHERE key = 'sell_confirm_deadline_minutes';
  SELECT COALESCE(NULLIF(value,'')::int, 7) INTO v_ship_days
  FROM public.platform_settings WHERE key = 'sell_ship_deadline_days';
  SELECT COALESCE(NULLIF(value,'')::int, 7) INTO v_receive_days
  FROM public.platform_settings WHERE key = 'sell_receive_deadline_days';

  v_pay_min      := COALESCE(v_pay_min, 15);
  v_confirm_min  := COALESCE(v_confirm_min, 15);
  v_ship_days    := COALESCE(v_ship_days, 7);
  v_receive_days := COALESCE(v_receive_days, 7);

  -- ① 逾時未按「我已完成匯款」→ 取消、回補庫存、退保證金（錯不在賣家）
  --    倒數管的是這個動作，不是銀行入帳（規則 2）。
  FOR r IN
    SELECT * FROM public.sell_orders
    WHERE cancelled = false AND step = 1
      AND created_at < NOW() - make_interval(mins => v_pay_min)
    ORDER BY id FOR UPDATE SKIP LOCKED
  LOOP
    -- 走 571 的回補：它改的是 specs（唯一真相），items 由 trigger 推導
    PERFORM public.sell_restore_stock(r.id);

    UPDATE public.sell_orders
    SET cancelled = true, cancel_reason = 'payment_timeout', updated_at = NOW()
    WHERE id = r.id;

    PERFORM public.sell_deposit_release(r.id, '買家逾時未付款');

    INSERT INTO public.sell_messages (listing_id, sender_id, receiver_id, kind, body)
    VALUES (r.listing_id, r.seller_id, r.buyer_id, 'system',
            '超過付款期限，訂單已自動取消');

    v_cancelled := v_cancelled + 1;
  END LOOP;

  -- ② 待確認收款超過 15 分鐘 → 視同已收款，自動進待出貨（規則 3）
  --    賣家沒空按也不該卡住買家；賣家真的沒收到錢，還有「未收到款項，取消訂單」。
  FOR r IN
    SELECT * FROM public.sell_orders
    WHERE cancelled = false AND step = 2
      AND COALESCE(paid_at, created_at) < NOW() - make_interval(mins => v_confirm_min)
    ORDER BY id FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.sell_orders
    SET step = 3, seller_confirmed_at = COALESCE(seller_confirmed_at, NOW()), updated_at = NOW()
    WHERE id = r.id;

    INSERT INTO public.sell_messages (listing_id, sender_id, receiver_id, kind, body)
    VALUES (r.listing_id, r.buyer_id, r.seller_id, 'system',
            '超過確認收款期限，系統已視同收款完成，請盡快出貨');

    v_auto_conf := v_auto_conf + 1;
  END LOOP;

  -- ③ 逾時未出貨 → 通知並告知可申訴（保證金不在這裡動，等買家決定）
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

  -- ④ 逾時未確認收貨 → 自動結案並退保證金（視同完成）
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
    'cancelled_unpaid',  v_cancelled,
    'auto_confirmed',    v_auto_conf,
    'flagged_unshipped', v_flagged,
    'auto_completed',    v_completed
  );
END;
$$;

COMMIT;
