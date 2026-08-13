-- 560_sell_ads_and_pro.sql
--
-- 商城變現的第二、三條線：廣告版位與官方認證商家。
--
-- 兩者都用 **G幣** 計價。平台賣 G幣本來就有金流，賣家用 G幣買曝光，
-- 錢在自家體系裡繞，不必再開任何代收代付。
--
-- ── 版位分兩種，權限完全不同 ──
--   self_serve = true   賣家在前台「廣告中心」自助購買（C2C 版位）
--   self_serve = false  供應商版位，只能由後台代客開單
--                       （供應商是公司對公司的生意，價格會談，不能自助下單）

BEGIN;

-- ============================================================
-- A. 版位型錄
-- ============================================================
-- 做成資料表而不是寫死在程式：價格與席次是營運參數，
-- 老闆要能在後台調整、停售某個版位，不必推版。

CREATE TABLE IF NOT EXISTS public.sell_ad_slots (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  description   text NOT NULL DEFAULT '',
  price_per_day int  NOT NULL CHECK (price_per_day >= 0),
  seats_per_day int  NOT NULL CHECK (seats_per_day > 0),
  audience      text NOT NULL DEFAULT 'c2c' CHECK (audience IN ('c2c','official')),
  self_serve    boolean NOT NULL DEFAULT true,
  needs_keyword boolean NOT NULL DEFAULT false,
  sort_order    int  NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN public.sell_ad_slots.self_serve IS 'true=前台賣家可自助購買；false=供應商版位，僅後台代客開單';

INSERT INTO public.sell_ad_slots (id,name,description,price_per_day,seats_per_day,audience,self_serve,needs_keyword,sort_order) VALUES
  ('feat', '精選商品格', '插在商城瀏覽動線中',     200, 10, 'c2c', true,  false, 1),
  ('hero', '首頁輪播',   '商城最上方大圖',         900,  5, 'c2c', true,  false, 2),
  ('kw',   '搜尋置頂',   '買家搜關鍵字時排第一',   450,  3, 'c2c', true,  true,  3),
  ('cat',  '分類首排',   '該分類頁最上方橫列',     300,  6, 'c2c', true,  false, 4),
  ('topic','專題位',     '編輯策展專題內卡片',     350,  8, 'c2c', true,  false, 5),
  ('done', '完成頁推薦', '買家剛結完帳看到',       250,  8, 'c2c', true,  false, 6),
  ('b_hero', '官方頁輪播', '官方旗艦店最上方大圖', 1500, 4, 'official', false, false, 11),
  ('b_new',  '新品首發位', '新品上市當週置頂',     1800, 3, 'official', false, false, 12),
  ('b_brand','品牌專區',   '供應商專屬橫向展區',   1100, 6, 'official', false, false, 13),
  ('b_feat', '官方頁精選格','官方頁瀑布流插卡',     600,10, 'official', false, false, 14)
ON CONFLICT (id) DO NOTHING;

-- 天數折扣（營運參數，同樣不寫死）
INSERT INTO public.platform_settings (key, value)
VALUES ('sell_ad_discounts', '[{"days":7,"rate":80},{"days":3,"rate":90},{"days":1,"rate":100}]')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- B. 檔期預訂
-- ============================================================
-- 一筆 booking 佔 start_date 起連續 days 天的 **1 個席次**。
-- 用「每天一列」會比較好算席次，但改天數就要刪列重建；
-- 這裡用區間存，查席次時展開，資料量小算得動。

CREATE TABLE IF NOT EXISTS public.sell_ad_bookings (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slot_id       text NOT NULL REFERENCES public.sell_ad_slots(id),
  listing_id    bigint REFERENCES public.sell_listings(id) ON DELETE CASCADE,
  buyer_id      uuid   REFERENCES public.users(id) ON DELETE SET NULL,
  supplier_name text,
  start_date    date NOT NULL,
  days          int  NOT NULL CHECK (days > 0),
  keyword       text,
  cost          int  NOT NULL DEFAULT 0 CHECK (cost >= 0),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled')),
  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sell_ad_bookings_slot_idx ON public.sell_ad_bookings(slot_id, start_date) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS sell_ad_bookings_listing_idx ON public.sell_ad_bookings(listing_id) WHERE status = 'active';

ALTER TABLE public.sell_ad_bookings ENABLE ROW LEVEL SECURITY;

-- 賣家看得到自己買的檔期
DROP POLICY IF EXISTS "Sell ad bookings - own read" ON public.sell_ad_bookings;
CREATE POLICY "Sell ad bookings - own read" ON public.sell_ad_bookings
  FOR SELECT USING (buyer_id = auth.uid());

-- 版位型錄前台要讀（廣告中心要列出價目）
ALTER TABLE public.sell_ad_slots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Sell ad slots - public read" ON public.sell_ad_slots;
CREATE POLICY "Sell ad slots - public read" ON public.sell_ad_slots
  FOR SELECT USING (is_active = true);

-- ============================================================
-- C. 席次查詢
-- ============================================================

-- 某版位某天還剩幾席
CREATE OR REPLACE FUNCTION public.sell_ad_seats_left(p_slot_id text, p_date date)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT GREATEST(0,
    COALESCE((SELECT seats_per_day FROM public.sell_ad_slots WHERE id = p_slot_id), 0)
    - COALESCE((
        SELECT COUNT(*) FROM public.sell_ad_bookings b
        WHERE b.slot_id = p_slot_id AND b.status = 'active'
          AND p_date >= b.start_date
          AND p_date <  b.start_date + b.days
      ), 0)::int
  );
$$;

-- 未來 N 天的席次表，前台廣告中心直接吃這個
CREATE OR REPLACE FUNCTION public.sell_ad_availability(p_slot_id text, p_days int DEFAULT 7)
RETURNS TABLE (d date, seats_left int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT g::date, public.sell_ad_seats_left(p_slot_id, g::date)
  FROM generate_series(CURRENT_DATE, CURRENT_DATE + (GREATEST(p_days,1) - 1), '1 day') g;
$$;

-- 報價（含天數折扣）
CREATE OR REPLACE FUNCTION public.sell_ad_quote(p_slot_id text, p_days int)
RETURNS int
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_price int;
  v_disc  jsonb;
  v_rate  int := 100;
  e       jsonb;
BEGIN
  SELECT price_per_day INTO v_price FROM public.sell_ad_slots WHERE id = p_slot_id AND is_active;
  IF v_price IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(value::jsonb, '[]'::jsonb) INTO v_disc
  FROM public.platform_settings WHERE key = 'sell_ad_discounts';

  -- 由長到短，第一個達標的折扣生效
  FOR e IN SELECT * FROM jsonb_array_elements(v_disc)
  LOOP
    IF p_days >= COALESCE((e ->> 'days')::int, 999) THEN
      v_rate := COALESCE((e ->> 'rate')::int, 100);
      EXIT;
    END IF;
  END LOOP;

  RETURN CEIL(v_price::numeric * p_days * v_rate / 100)::int;
END;
$$;

-- ============================================================
-- D. 自助購買
-- ============================================================

CREATE OR REPLACE FUNCTION public.sell_ad_purchase(
  p_slot_id text, p_listing_id bigint, p_start_date date, p_days int, p_keyword text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_uid     uuid;
  v_slot    RECORD;
  v_listing RECORD;
  v_cost    int;
  v_bal     int;
  d         date;
  v_id      bigint;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '請先登入');
  END IF;

  SELECT * INTO v_slot FROM public.sell_ad_slots WHERE id = p_slot_id AND is_active;
  IF v_slot IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '這個版位目前沒有開放');
  END IF;

  -- 供應商版位不給前台買，擋在函式而不是只藏按鈕
  IF NOT v_slot.self_serve THEN
    RETURN jsonb_build_object('success', false, 'message', '這個版位需要聯繫平台洽談');
  END IF;

  IF p_days IS NULL OR p_days < 1 THEN
    RETURN jsonb_build_object('success', false, 'message', '請選擇天數');
  END IF;
  IF p_start_date IS NULL OR p_start_date < CURRENT_DATE THEN
    RETURN jsonb_build_object('success', false, 'message', '請選擇今天以後的檔期');
  END IF;

  SELECT * INTO v_listing FROM public.sell_listings WHERE id = p_listing_id;
  IF v_listing IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '找不到這件商品');
  END IF;
  IF v_listing.seller_id <> v_uid THEN
    RETURN jsonb_build_object('success', false, 'message', '只能推廣自己的商品');
  END IF;
  IF v_listing.status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'message', '商品要先通過審核並上架才能推廣');
  END IF;

  IF v_slot.needs_keyword AND COALESCE(btrim(p_keyword), '') = '' THEN
    RETURN jsonb_build_object('success', false, 'message', '請選擇要綁定的關鍵字');
  END IF;

  -- 整段檔期每一天都要有席次，缺一天就不能賣
  d := p_start_date;
  WHILE d < p_start_date + p_days LOOP
    IF public.sell_ad_seats_left(p_slot_id, d) <= 0 THEN
      RETURN jsonb_build_object('success', false, 'message', to_char(d, 'MM/DD') || ' 已經額滿，請改選其他檔期');
    END IF;
    d := d + 1;
  END LOOP;

  v_cost := public.sell_ad_quote(p_slot_id, p_days);

  SELECT tokens INTO v_bal FROM public.users WHERE id = v_uid FOR UPDATE;
  IF COALESCE(v_bal, 0) < v_cost THEN
    RETURN jsonb_build_object('success', false, 'message',
      'G幣不足，還差 ' || (v_cost - COALESCE(v_bal,0)) || ' G');
  END IF;

  UPDATE public.users SET tokens = tokens - v_cost WHERE id = v_uid;
  INSERT INTO public.token_adjustments (user_id, delta, reason, created_by)
  VALUES (v_uid, -v_cost, '商城廣告：' || v_slot.name || ' ' || p_days || ' 天', 'system');

  INSERT INTO public.sell_ad_bookings (slot_id, listing_id, buyer_id, start_date, days, keyword, cost, created_by)
  VALUES (p_slot_id, p_listing_id, v_uid, p_start_date, p_days, NULLIF(btrim(p_keyword), ''), v_cost, 'self')
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'booking_id', v_id, 'cost', v_cost);
END;
$$;

-- ============================================================
-- E. 目前正在投放的廣告
-- ============================================================
-- 前台各版位直接查這個 view，不必自己算日期區間。

CREATE OR REPLACE VIEW public.sell_ads_live AS
SELECT b.id, b.slot_id, b.listing_id, b.keyword, b.supplier_name, s.audience, s.name AS slot_name
FROM public.sell_ad_bookings b
JOIN public.sell_ad_slots s ON s.id = b.slot_id
WHERE b.status = 'active'
  AND CURRENT_DATE >= b.start_date
  AND CURRENT_DATE <  b.start_date + b.days;

COMMENT ON VIEW public.sell_ads_live IS '今天正在投放的廣告檔期，前台各版位據此決定要插哪些商品';

-- ============================================================
-- F. 官方認證商家
-- ============================================================
-- 月費訂閱。解鎖的是「曝光與信任」，**不動保證金比例** ——
-- 保證金是買家保障，用錢買掉會讓整套機制失去意義。

CREATE TABLE IF NOT EXISTS public.sell_pro_subscriptions (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT NOW(),
  expires_at timestamptz NOT NULL,
  cost       int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sell_pro_user_idx ON public.sell_pro_subscriptions(user_id, expires_at DESC);

ALTER TABLE public.sell_pro_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Sell pro - own read" ON public.sell_pro_subscriptions;
CREATE POLICY "Sell pro - own read" ON public.sell_pro_subscriptions
  FOR SELECT USING (user_id = auth.uid());

INSERT INTO public.platform_settings (key, value)
VALUES ('sell_pro_monthly_price', '1200')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.sell_is_pro(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sell_pro_subscriptions
    WHERE user_id = p_user_id AND expires_at > NOW()
  );
$$;

CREATE OR REPLACE FUNCTION public.sell_pro_subscribe()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_uid   uuid;
  v_price int;
  v_bal   int;
  v_from  timestamptz;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '請先登入');
  END IF;

  SELECT COALESCE(NULLIF(value,'')::int, 1200) INTO v_price
  FROM public.platform_settings WHERE key = 'sell_pro_monthly_price';
  v_price := COALESCE(v_price, 1200);

  SELECT tokens INTO v_bal FROM public.users WHERE id = v_uid FOR UPDATE;
  IF COALESCE(v_bal, 0) < v_price THEN
    RETURN jsonb_build_object('success', false, 'message',
      'G幣不足，還差 ' || (v_price - COALESCE(v_bal,0)) || ' G');
  END IF;

  -- 還在有效期內就續約疊加，不是從今天重算 —— 提前續約不該吃掉剩餘天數
  SELECT GREATEST(COALESCE(MAX(expires_at), NOW()), NOW()) INTO v_from
  FROM public.sell_pro_subscriptions WHERE user_id = v_uid;

  UPDATE public.users SET tokens = tokens - v_price WHERE id = v_uid;
  INSERT INTO public.token_adjustments (user_id, delta, reason, created_by)
  VALUES (v_uid, -v_price, '商城官方認證商家月費', 'system');

  INSERT INTO public.sell_pro_subscriptions (user_id, started_at, expires_at, cost)
  VALUES (v_uid, NOW(), v_from + INTERVAL '30 days', v_price);

  RETURN jsonb_build_object('success', true, 'expires_at', v_from + INTERVAL '30 days');
END;
$$;

COMMIT;
