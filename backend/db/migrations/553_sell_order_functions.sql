-- 553_sell_order_functions.sql
--
-- 玩家商城訂單函式調整（承 552）：
--   1. 收款方式改由「賣家個人檔案」決定，買家不能挑、也不能偽造
--   2. 移除面交（private）與代收（escrow）—— 玩家商城一律雙方自理
--   3. 停權賣家不能被下單
--   4. 修 cancel_sell_order 會把「被退回的刊登」復活成上架的洞
--   5. 逾期自動化
--
-- ⚠️ 這裡只動 sell_*（玩家商城）。marketplace_*（交易所）與 exchange_*（卡牌交換）不碰。

BEGIN;

-- ============================================================
-- A. 收款方式統一用語
-- ============================================================
--
-- 原本 sell_orders.payment_method 是 'transfer' / 'private' / 'escrow'，
-- 而賣家檔案用 'bank' / 'linepay'。兩套詞彙對不起來，讀 code 的人會混淆。
-- 表內 0 筆訂單，直接統一成跟賣家檔案一樣的 'bank' / 'linepay'。

UPDATE public.sell_orders SET payment_method = 'bank' WHERE payment_method = 'transfer';

ALTER TABLE public.sell_orders ALTER COLUMN payment_method SET DEFAULT 'bank';

ALTER TABLE public.sell_orders DROP CONSTRAINT IF EXISTS sell_orders_payment_method_check;
ALTER TABLE public.sell_orders
  ADD CONSTRAINT sell_orders_payment_method_check
  CHECK (payment_method IN ('bank','linepay'));

-- 逾期只通知一次，不要每天洗版
ALTER TABLE public.sell_orders
  ADD COLUMN IF NOT EXISTS overdue_notified_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_sell_orders_open_step
  ON public.sell_orders (step, created_at)
  WHERE cancelled = false;

-- ============================================================
-- B. create_sell_order：收款方式取自賣家檔案
-- ============================================================
--
-- 為什麼不讓買家傳 payment_method：
-- 老闆定調「賣家就想要特定一種收款方式，那是他的自由」。
-- 既然是賣家的自由，那就以賣家檔案為準；參數保留只為相容既有前台呼叫，實際忽略。

CREATE OR REPLACE FUNCTION public.create_sell_order(
  p_listing_id     bigint,
  p_item_index     integer,
  p_quantity       integer,
  p_payment_method text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $function$
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
BEGIN
  v_buyer_id := auth.uid();
  IF v_buyer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '請先登入');
  END IF;

  IF p_quantity IS NULL OR p_quantity < 1 THEN
    RETURN jsonb_build_object('success', false, 'message', '購買數量不正確');
  END IF;

  SELECT * INTO v_listing
  FROM public.sell_listings
  WHERE id = p_listing_id AND status = 'active'
  FOR UPDATE;

  IF v_listing IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '這件商品已經不在架上了');
  END IF;

  IF v_listing.seller_id = v_buyer_id THEN
    RETURN jsonb_build_object('success', false, 'message', '不能購買自己的商品');
  END IF;

  -- 賣家收款方式：沒設定就不能被下單（買家沒地方付錢）
  SELECT * INTO v_profile
  FROM public.sell_seller_profiles
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

  v_new_qty := v_available - p_quantity;
  v_items   := jsonb_set(v_items, ARRAY[p_item_index::text, 'quantity'], to_jsonb(v_new_qty), true);

  UPDATE public.sell_listings
  SET items = v_items, updated_at = NOW()
  WHERE id = p_listing_id;

  SELECT NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_items) AS e
    WHERE COALESCE(NULLIF((e->>'quantity'), '')::int, 0) > 0
  ) INTO v_all_sold;

  IF v_all_sold THEN
    UPDATE public.sell_listings SET status = 'sold', updated_at = NOW() WHERE id = p_listing_id;
  END IF;

  INSERT INTO public.sell_orders (
    listing_id, seller_id, buyer_id, item_index, quantity,
    unit_price, payment_method, payment_status, step, cancelled
  ) VALUES (
    p_listing_id, v_listing.seller_id, v_buyer_id, p_item_index, p_quantity,
    v_unit_price, v_method, 'unpaid', 1, false
  ) RETURNING id INTO v_order_id;

  INSERT INTO public.sell_messages (listing_id, sender_id, receiver_id, kind, body)
  VALUES (p_listing_id, v_buyer_id, v_listing.seller_id, 'system', '已建立訂單');

  RETURN jsonb_build_object('success', true, 'order_id', v_order_id, 'payment_method', v_method);
END;
$function$;

-- ============================================================
-- C. cancel_sell_order：修「取消訂單會讓被退回的刊登復活」
-- ============================================================
--
-- 原本是無條件 `SET status = 'active'`。
-- 552 之後多了 pending / rejected / removed，這行會變成一個真的洞：
-- 賣家把被退回的商品下單再取消，就自動變成上架中。
-- 正確行為：只有「因為賣光才變 sold」的才回到 active，其餘狀態原封不動。

CREATE OR REPLACE FUNCTION public.cancel_sell_order(p_order_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $function$
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
  v_items     := jsonb_set(
                   v_items,
                   ARRAY[v_order.item_index::text, 'quantity'],
                   to_jsonb(v_available + v_order.quantity),
                   true
                 );

  UPDATE public.sell_listings
  SET items  = v_items,
      -- 只把「賣光」的那種放回架上；pending / rejected / removed 保持原狀
      status = CASE WHEN status = 'sold' THEN 'active' ELSE status END,
      updated_at = NOW()
  WHERE id = v_listing.id;

  UPDATE public.sell_orders
  SET cancelled = true, cancel_reason = 'cancelled', updated_at = NOW()
  WHERE id = v_order.id;

  INSERT INTO public.sell_messages (listing_id, sender_id, receiver_id, kind, body)
  VALUES (
    v_listing.id, v_uid,
    CASE WHEN v_uid = v_order.buyer_id THEN v_order.seller_id ELSE v_order.buyer_id END,
    'system', '訂單已取消'
  );

  RETURN jsonb_build_object('success', true);
END;
$function$;

-- ============================================================
-- D. 逾期自動化
-- ============================================================
--
-- 平台不碰錢，所以能自動做的事有限，這點要誠實面對：
--
--   step 1 待付款   → 逾時「可以」自動取消：錢還沒動，回補庫存就沒事了
--   step 3 待出貨   → 逾時「不能」自動取消：錢已經直接進賣家口袋，
--                     平台取消訂單也拿不回來。只能標記、通知雙方、留下紀錄，
--                     讓買家去檢舉、後台去停權
--   step 4 待收貨   → 逾時自動結案：買家收到東西卻忘記按確認是常態
--
-- 由 cron 每小時呼叫一次。

CREATE OR REPLACE FUNCTION public.sell_run_order_expiry()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $function$
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

  -- ① step 1 逾時未付款 → 取消並回補庫存
  FOR r IN
    SELECT * FROM public.sell_orders
    WHERE cancelled = false AND step = 1
      AND created_at < NOW() - make_interval(hours => v_pay_hours)
    ORDER BY id
    FOR UPDATE SKIP LOCKED
  LOOP
    SELECT COALESCE(items, '[]'::jsonb) INTO v_items
    FROM public.sell_listings WHERE id = r.listing_id FOR UPDATE;

    v_item  := v_items -> r.item_index;
    v_items := jsonb_set(
                 v_items,
                 ARRAY[r.item_index::text, 'quantity'],
                 to_jsonb(COALESCE(NULLIF((v_item ->> 'quantity'), '')::int, 0) + r.quantity),
                 true
               );

    UPDATE public.sell_listings
    SET items = v_items,
        status = CASE WHEN status = 'sold' THEN 'active' ELSE status END,
        updated_at = NOW()
    WHERE id = r.listing_id;

    UPDATE public.sell_orders
    SET cancelled = true, cancel_reason = 'payment_timeout', updated_at = NOW()
    WHERE id = r.id;

    INSERT INTO public.sell_messages (listing_id, sender_id, receiver_id, kind, body)
    VALUES (r.listing_id, r.seller_id, r.buyer_id, 'system',
            '超過付款期限，訂單已自動取消');

    v_cancelled := v_cancelled + 1;
  END LOOP;

  -- ② step 3 逾時未出貨 → 只標記與通知（錢已經匯給賣家，平台取消也無濟於事）
  FOR r IN
    SELECT * FROM public.sell_orders
    WHERE cancelled = false AND step = 3
      AND overdue_notified_at IS NULL
      AND COALESCE(seller_confirmed_at, created_at) < NOW() - make_interval(days => v_ship_days)
    ORDER BY id
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.sell_orders SET overdue_notified_at = NOW(), updated_at = NOW() WHERE id = r.id;

    INSERT INTO public.sell_messages (listing_id, sender_id, receiver_id, kind, body)
    VALUES (r.listing_id, r.buyer_id, r.seller_id, 'system',
            '這筆訂單已超過出貨期限，請盡快處理');
    INSERT INTO public.sell_messages (listing_id, sender_id, receiver_id, kind, body)
    VALUES (r.listing_id, r.seller_id, r.buyer_id, 'system',
            '賣家已超過出貨期限。若聯繫不上，可以在訂單頁提出檢舉');

    v_flagged := v_flagged + 1;
  END LOOP;

  -- ③ step 4 逾時未確認收貨 → 自動結案
  FOR r IN
    SELECT * FROM public.sell_orders
    WHERE cancelled = false AND step = 4
      AND COALESCE(shipped_at, created_at) < NOW() - make_interval(days => v_receive_days)
    ORDER BY id
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.sell_orders
    SET step = 5, received_at = COALESCE(received_at, NOW()),
        completed_at = NOW(), updated_at = NOW()
    WHERE id = r.id;

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
$function$;

REVOKE ALL ON FUNCTION public.sell_run_order_expiry() FROM PUBLIC, anon, authenticated;

COMMIT;
