-- 561_official_shop.sql
--
-- 官方商城（B2C）：平台自售、走綠界收真錢。
--
-- ── 為什麼商品共用 sell_listings、訂單卻另開一張表 ──
--
-- 商品面幾乎一樣（標題、多圖、多規格、類別、庫存），共用可以直接沿用
-- 前台的卡片、列表、商品頁，不必維護兩套長得一樣的畫面。
-- 官方商品用 is_official 標記，由 service_role 寫入 —— sell_guard_listing()
-- 開頭就對 privileged 放行，所以審核、實名、上架則數、售價上限一概不適用（本來就該如此，
-- 平台不需要審自己）。
--
-- 訂單面則是完全不同的生意：
--   C2C  平台不碰錢、買家匯給賣家、有保證金、有「賣家確認收款」這一步
--   B2C  錢進平台、綠界代收、開發票、七天鑑賞期原路退刷、平台自己出貨
-- 硬塞進 sell_orders 會讓每一支既有函式都長出 IF order_type='b2c' 的分支，
-- 那是把兩件事綁在一起慢慢爛掉。所以另開 shop_orders。

BEGIN;

-- ============================================================
-- A. 官方商品標記
-- ============================================================

ALTER TABLE public.sell_listings
  ADD COLUMN IF NOT EXISTS is_official boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sold_count  int     NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.sell_listings.is_official IS 'true = 官方自售（B2C），走 shop_orders 與綠界；false = 玩家商城（C2C）';
COMMENT ON COLUMN public.sell_listings.sold_count  IS '累計售出數，官方頁熱賣排行用';

CREATE INDEX IF NOT EXISTS sell_listings_official_idx
  ON public.sell_listings(is_official, status) WHERE status = 'active';

-- 前台要能公開讀官方商品。既有的 C2C 讀取政策是給 active 的刊登，
-- 官方商品同樣是 active，所以沿用即可；這裡只確認政策存在。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'sell_listings' AND policyname = 'Sell listings - official public read'
  ) THEN
    CREATE POLICY "Sell listings - official public read" ON public.sell_listings
      FOR SELECT USING (is_official = true AND status = 'active');
  END IF;
END $$;

-- ============================================================
-- B. C2C 下單函式要擋掉官方商品
-- ============================================================
-- 官方商品若被 create_sell_order 買走，會去找不存在的賣家收款設定，
-- 還會向「平台帳號」收保證金 —— 整條邏輯都不對。

CREATE OR REPLACE FUNCTION public.sell_reject_official_c2c()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.sell_listings WHERE id = NEW.listing_id AND is_official) THEN
    RAISE EXCEPTION '官方商品請使用官方商城結帳';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sell_orders_reject_official ON public.sell_orders;
CREATE TRIGGER trg_sell_orders_reject_official
  BEFORE INSERT ON public.sell_orders
  FOR EACH ROW EXECUTE FUNCTION public.sell_reject_official_c2c();

-- ============================================================
-- C. 官方訂單
-- ============================================================
-- 狀態機（跟 C2C 的五步刻意不同，因為沒有「賣家確認收款」）：
--   1 已付款 → 2 備貨中 → 3 已出貨 → 4 完成
--   任何階段都可能 refunded

CREATE TABLE IF NOT EXISTS public.shop_orders (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_number   text UNIQUE,
  listing_id     bigint NOT NULL REFERENCES public.sell_listings(id),
  buyer_id       uuid   NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  item_index     int    NOT NULL DEFAULT 0,
  quantity       int    NOT NULL CHECK (quantity > 0),
  unit_price     int    NOT NULL CHECK (unit_price >= 0),
  shipping_fee   int    NOT NULL DEFAULT 0,
  total_amount   int    NOT NULL CHECK (total_amount >= 0),
  step           int    NOT NULL DEFAULT 1 CHECK (step BETWEEN 1 AND 4),
  payment_status text   NOT NULL DEFAULT 'unpaid'
                 CHECK (payment_status IN ('unpaid','paid','refunded','failed')),
  -- 綠界
  ecpay_trade_no    text,
  ecpay_payment_type text,
  ecpay_raw         jsonb,
  paid_at        timestamptz,
  -- 出貨
  tracking_number text,
  shipped_at     timestamptz,
  received_at    timestamptz,
  completed_at   timestamptz,
  -- 退款
  refund_reason  text,
  refunded_at    timestamptz,
  -- 收件
  recipient_name  text,
  recipient_phone text,
  recipient_addr  text,
  created_at     timestamptz NOT NULL DEFAULT NOW(),
  updated_at     timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS shop_orders_buyer_idx ON public.shop_orders(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS shop_orders_step_idx  ON public.shop_orders(step) WHERE payment_status = 'paid';

ALTER TABLE public.shop_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Shop orders - own read" ON public.shop_orders;
CREATE POLICY "Shop orders - own read" ON public.shop_orders
  FOR SELECT USING (buyer_id = auth.uid());

-- 寫入一律走 SECURITY DEFINER 函式或後台 service_role

-- 訂單編號：S + 年月日 + 流水
CREATE OR REPLACE FUNCTION public.shop_order_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    NEW.order_number := 'S' || to_char(NOW() AT TIME ZONE 'Asia/Taipei', 'YYMMDD')
                        || lpad(NEW.id::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shop_order_number ON public.shop_orders;
CREATE TRIGGER trg_shop_order_number
  BEFORE INSERT ON public.shop_orders
  FOR EACH ROW EXECUTE FUNCTION public.shop_order_number();

-- ============================================================
-- D. 建立官方訂單（未付款，等綠界 callback 才入帳）
-- ============================================================
-- 先扣庫存再導去付款：不先扣的話，同一件庫存 1 的商品可以被十個人
-- 同時帶去綠界，回來全部付款成功，然後平台出不了貨。
-- 沒付款的訂單由排程回補庫存（跟 C2C 的付款逾時同一個道理）。

CREATE OR REPLACE FUNCTION public.create_shop_order(
  p_listing_id bigint, p_item_index int, p_quantity int,
  p_name text, p_phone text, p_addr text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_uid      uuid;
  v_listing  RECORD;
  v_items    jsonb;
  v_item     jsonb;
  v_avail    int;
  v_price    int;
  v_ship     int;
  v_order_id bigint;
  v_no       text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '請先登入');
  END IF;

  IF COALESCE(btrim(p_name),'') = '' OR COALESCE(btrim(p_phone),'') = '' OR COALESCE(btrim(p_addr),'') = '' THEN
    RETURN jsonb_build_object('success', false, 'message', '請填寫完整的收件資訊');
  END IF;

  IF p_quantity IS NULL OR p_quantity < 1 THEN
    RETURN jsonb_build_object('success', false, 'message', '購買數量不正確');
  END IF;

  SELECT * INTO v_listing FROM public.sell_listings
  WHERE id = p_listing_id AND is_official AND status = 'active' FOR UPDATE;

  IF v_listing IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '這件商品已經不在架上了');
  END IF;

  v_items := COALESCE(v_listing.items, '[]'::jsonb);
  IF p_item_index < 0 OR p_item_index >= jsonb_array_length(v_items) THEN
    RETURN jsonb_build_object('success', false, 'message', '找不到這個規格');
  END IF;

  v_item  := v_items -> p_item_index;
  v_avail := COALESCE(NULLIF(v_item ->> 'quantity', '')::int, 0);
  IF v_avail < p_quantity THEN
    RETURN jsonb_build_object('success', false, 'message', '庫存不足');
  END IF;

  v_price := COALESCE(NULLIF(v_item ->> 'price', '')::int, v_listing.price, 0);
  IF v_price <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', '商品金額設定有誤');
  END IF;
  v_ship := COALESCE(v_listing.shipping_fee, 0);

  UPDATE public.sell_listings
  SET items = jsonb_set(v_items, ARRAY[p_item_index::text,'quantity'], to_jsonb(v_avail - p_quantity), true),
      updated_at = NOW()
  WHERE id = p_listing_id;

  INSERT INTO public.shop_orders (
    listing_id, buyer_id, item_index, quantity, unit_price, shipping_fee, total_amount,
    recipient_name, recipient_phone, recipient_addr
  ) VALUES (
    p_listing_id, v_uid, p_item_index, p_quantity, v_price, v_ship,
    v_price * p_quantity + v_ship,
    btrim(p_name), btrim(p_phone), btrim(p_addr)
  ) RETURNING id, order_number INTO v_order_id, v_no;

  RETURN jsonb_build_object('success', true, 'order_id', v_order_id, 'order_number', v_no,
                            'total_amount', v_price * p_quantity + v_ship);
END;
$$;

-- ============================================================
-- E. 綠界付款成功（後台 callback 呼叫，service_role）
-- ============================================================

CREATE OR REPLACE FUNCTION public.shop_order_mark_paid(
  p_order_id bigint, p_trade_no text, p_payment_type text, p_raw jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE o RECORD;
BEGIN
  SELECT * INTO o FROM public.shop_orders WHERE id = p_order_id FOR UPDATE;
  IF o IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'order_not_found');
  END IF;

  -- 冪等：綠界會重送，重複入帳會讓庫存與出貨全部錯亂
  IF o.payment_status = 'paid' THEN
    RETURN jsonb_build_object('success', true, 'message', 'already_paid');
  END IF;

  UPDATE public.shop_orders
  SET payment_status = 'paid', paid_at = NOW(), step = 2,
      ecpay_trade_no = p_trade_no, ecpay_payment_type = p_payment_type,
      ecpay_raw = COALESCE(p_raw, ecpay_raw), updated_at = NOW()
  WHERE id = p_order_id;

  UPDATE public.sell_listings
  SET sold_count = sold_count + o.quantity, updated_at = NOW()
  WHERE id = o.listing_id;

  INSERT INTO public.notifications (user_id, type, title, body, link, meta)
  VALUES (o.buyer_id, 'shop_order', '官方商城', '付款完成，商品備貨中',
          '/shop-orders/' || p_order_id::text,
          jsonb_build_object('order_id', p_order_id));

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ============================================================
-- F. 買家確認收貨
-- ============================================================

CREATE OR REPLACE FUNCTION public.shop_order_confirm_received(p_order_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_uid uuid;
  o     RECORD;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '請先登入');
  END IF;

  SELECT * INTO o FROM public.shop_orders WHERE id = p_order_id FOR UPDATE;
  IF o IS NULL OR o.buyer_id <> v_uid THEN
    RETURN jsonb_build_object('success', false, 'message', '找不到這筆訂單');
  END IF;
  IF o.step <> 3 THEN
    RETURN jsonb_build_object('success', false, 'message', '這筆訂單目前不能確認收貨');
  END IF;

  UPDATE public.shop_orders
  SET step = 4, received_at = NOW(), completed_at = NOW(), updated_at = NOW()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ============================================================
-- G. 未付款逾時回補庫存
-- ============================================================

CREATE OR REPLACE FUNCTION public.shop_run_order_expiry()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r        RECORD;
  v_items  jsonb;
  v_item   jsonb;
  v_cnt    int := 0;
BEGIN
  FOR r IN
    SELECT * FROM public.shop_orders
    WHERE payment_status = 'unpaid' AND created_at < NOW() - INTERVAL '1 hour'
    ORDER BY id FOR UPDATE SKIP LOCKED
  LOOP
    SELECT COALESCE(items,'[]'::jsonb) INTO v_items
    FROM public.sell_listings WHERE id = r.listing_id FOR UPDATE;

    v_item := v_items -> r.item_index;
    UPDATE public.sell_listings
    SET items = jsonb_set(v_items, ARRAY[r.item_index::text,'quantity'],
                 to_jsonb(COALESCE(NULLIF(v_item ->> 'quantity','')::int,0) + r.quantity), true),
        updated_at = NOW()
    WHERE id = r.listing_id;

    UPDATE public.shop_orders
    SET payment_status = 'failed', updated_at = NOW()
    WHERE id = r.id;

    v_cnt := v_cnt + 1;
  END LOOP;

  RETURN jsonb_build_object('expired_unpaid', v_cnt);
END;
$$;

-- ============================================================
-- H. 官方商城設定
-- ============================================================

INSERT INTO public.platform_settings (key, value) VALUES
  ('shop_enabled', 'true'),
  ('shop_ship_days', '2'),
  ('shop_return_days', '7'),
  ('shop_disclaimer', '官方商城由吉吉比自營，開立電子發票。商品享 7 天鑑賞期（非退貨保證期），退款將原路退回原付款方式。')
ON CONFLICT (key) DO NOTHING;

COMMIT;
