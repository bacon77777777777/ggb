-- 669：交易所設定（老闆 2026-09-01「後台交易所管理要拆三頁」）
--
-- 交易所到目前為止沒有任何可調參數：
--   ・手續費 5% 寫在 platform_settings 但後台沒有介面，要改只能下 SQL
--   ・「哪些賞可以上架」寫死在 is_major_grade 這個 IMMUTABLE 函數裡，
--     前端 frontend/app/profile/page.tsx 的 isMajorGrade 是它的複製品。
--     老闆想開放 D 賞、或反過來只留 A 賞以上，都得改程式再推版
--   ・售價沒有上下限：1 G 上架洗手續費、或掛 999999 G 佔版面都擋不住
--
-- 這支把三件事變成後台設定（/marketplace/settings），並且讓前台讀得到 ——
-- 前台要拿它來決定「倉庫裡哪些東西給你按上架」與「價格輸入框的範圍」。
--
-- ⚠️ is_major_grade 本身不動：它是 IMMUTABLE，改成讀設定就得降成 STABLE，
-- 而它同時被前端規則、舊資料語意綁著。新增一支 marketplace_level_allowed，
-- 沒設定時原樣退回 is_major_grade —— 也就是「不設定＝維持現狀」。

-- ─────────────────────────────────────────────────────────────
-- 設定鍵
-- ─────────────────────────────────────────────────────────────
INSERT INTO public.platform_settings (key, value) VALUES
  ('marketplace_fee_percent',   '5'),
  -- 空陣列＝不限制，退回 is_major_grade 的判定（＝現狀）
  ('marketplace_allowed_levels', '["SP賞","S賞","A賞","B賞","C賞","最後賞"]'),
  ('marketplace_min_price',     '50'),
  ('marketplace_max_price',     '100000')
ON CONFLICT (key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 前台要讀得到這幾個鍵
--
-- 原本的公開讀政策只放行 promo_/shipping_/sell_/free_shipping_ 四組前綴。
-- 交易所的手續費、可上架賞等、價格上下限都是「玩家上架前就該看到的規則」，
-- 藏起來只會讓他填完價格才被 RPC 打回票。
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "public can read public settings" ON public.platform_settings;
CREATE POLICY "public can read public settings" ON public.platform_settings
  FOR SELECT USING (
    key LIKE 'promo\_%'
    OR key LIKE 'shipping\_%'
    OR key LIKE 'sell\_%'
    OR key LIKE 'free\_shipping\_%'
    OR key LIKE 'marketplace\_%'
  );

-- ─────────────────────────────────────────────────────────────
-- 可上架賞等判定
--
-- 正規化方式跟 is_major_grade 一致（「A賞 限定版」→「A」），
-- 這樣後台設定裡填「A賞」就吃得下實際資料裡的各種寫法。
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.marketplace_norm_level(p_grade text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text;
  v_idx int;
BEGIN
  IF p_grade IS NULL THEN RETURN ''; END IF;
  v := btrim(p_grade);
  IF v = '' THEN RETURN ''; END IF;
  IF upper(v) = 'LAST ONE' OR v = '最後賞' THEN RETURN '最後賞'; END IF;
  v_idx := position('賞' in v);
  IF v_idx > 0 THEN v := left(v, v_idx - 1); END IF;
  IF position(' ' in v) > 0 THEN v := split_part(v, ' ', 1); END IF;
  RETURN upper(btrim(v));
END;
$$;

CREATE OR REPLACE FUNCTION public.marketplace_level_allowed(p_grade text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_raw  text;
  v_list text[];
BEGIN
  SELECT NULLIF(value, '') INTO v_raw
    FROM platform_settings WHERE key = 'marketplace_allowed_levels';

  -- 沒設定／不是合法 JSON 陣列／空陣列 → 維持現狀（大賞才准上架）
  IF v_raw IS NULL THEN RETURN public.is_major_grade(p_grade); END IF;
  BEGIN
    SELECT array_agg(public.marketplace_norm_level(x))
      INTO v_list
      FROM jsonb_array_elements_text(v_raw::jsonb) AS x;
  EXCEPTION WHEN others THEN
    RETURN public.is_major_grade(p_grade);
  END;
  IF v_list IS NULL OR array_length(v_list, 1) IS NULL THEN
    RETURN public.is_major_grade(p_grade);
  END IF;

  RETURN public.marketplace_norm_level(p_grade) = ANY(v_list);
END;
$$;

GRANT EXECUTE ON FUNCTION public.marketplace_norm_level(text)     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_level_allowed(text)  TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 上架：改吃設定的賞等白名單 + 價格上下限
--
-- 其餘規則（自己的、in_warehouse、非抽籤販售、預購要到貨）原封不動。
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_listing(
  p_record_id bigint,
  p_price     integer,
  p_user_id   uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := COALESCE(auth.uid(), p_user_id);
  v_rec    RECORD;
  v_listing_id bigint;
  v_min    integer;
  v_max    integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '請先登入');
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS NOT NULL AND p_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'message', '無法操作他人的獎品');
  END IF;
  IF p_price IS NULL OR p_price <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', '售價要大於 0');
  END IF;

  SELECT COALESCE((SELECT NULLIF(value,'')::int FROM platform_settings WHERE key='marketplace_min_price'), 1),
         COALESCE((SELECT NULLIF(value,'')::int FROM platform_settings WHERE key='marketplace_max_price'), 2147483647)
    INTO v_min, v_max;

  IF p_price < v_min THEN
    RETURN jsonb_build_object('success', false, 'message', format('售價不能低於 %s G', v_min));
  END IF;
  IF p_price > v_max THEN
    RETURN jsonb_build_object('success', false, 'message', format('售價不能高於 %s G', v_max));
  END IF;

  SELECT dr.id, dr.user_id, dr.status, dr.prize_level, dr.created_at,
         p.sale_mode, p.is_preorder, p.preorder_available_at
    INTO v_rec
    FROM draw_records dr
    JOIN products p ON p.id = dr.product_id
   WHERE dr.id = p_record_id
   FOR UPDATE OF dr;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', '找不到這個獎品');
  END IF;
  IF v_rec.user_id <> v_uid THEN
    RETURN jsonb_build_object('success', false, 'message', '這不是你的獎品');
  END IF;
  IF v_rec.status = 'listing' THEN
    RETURN jsonb_build_object('success', false, 'message', '這個獎品已經在架上了');
  END IF;
  IF v_rec.status <> 'in_warehouse' THEN
    RETURN jsonb_build_object('success', false, 'message', '只有還沒申請配送的獎品可以上架');
  END IF;
  IF NOT public.marketplace_level_allowed(v_rec.prize_level) THEN
    RETURN jsonb_build_object('success', false, 'message', '這個賞等不開放上架交易所');
  END IF;
  IF v_rec.sale_mode = 'lottery' THEN
    RETURN jsonb_build_object('success', false, 'message', '抽籤販售的獎品不能上架');
  END IF;
  IF v_rec.is_preorder AND COALESCE(v_rec.preorder_available_at, 'infinity'::timestamptz) > NOW() THEN
    RETURN jsonb_build_object('success', false, 'message', '預購商品要等到貨之後才能上架');
  END IF;

  INSERT INTO marketplace_listings (seller_id, draw_record_id, price, status, item_type)
  VALUES (v_uid, p_record_id, p_price, 'active', 'draw_prize')
  RETURNING id INTO v_listing_id;

  UPDATE draw_records SET status = 'listing' WHERE id = p_record_id;

  RETURN jsonb_build_object('success', true, 'message', '上架成功', 'listing_id', v_listing_id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_listing(bigint, integer, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.create_listing(bigint, integer, uuid) TO authenticated;

COMMENT ON FUNCTION public.marketplace_level_allowed(text) IS
  '交易所可上架賞等判定。讀 platform_settings.marketplace_allowed_levels；沒設定就退回 is_major_grade（＝現狀）。';
