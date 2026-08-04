-- 425: 出貨運費改由伺服器計算，不再信任前端傳入的金額
--
-- 原本 create_delivery_order 直接拿 p_delivery_fee_points 去扣代幣，完全沒有驗算。
-- 這代表會寫程式的人可以直接呼叫 RPC 並帶 p_delivery_fee_points = 0 拿到免運，
-- 與先前 play_gacha 沒有檢查 p_count 是同一類問題（migration 403）。
--
-- 順帶修掉一個營運面的錯：前端讀不到 platform_settings 時會沿用寫死的預設值
-- 並把它送進來，所以後台調高運費後，實際只會扣到舊價（migration 424 已讓前端讀得到，
-- 但只要金額仍由前端決定，這個風險就不會消失）。
--
-- 參數保留但只當作「前端顯示給玩家看的金額」，與伺服器算出來的不符就擋下來 ——
-- 直接靜默改價會讓玩家以為被亂扣。

CREATE OR REPLACE FUNCTION public.calc_delivery_fee(
  p_logistics_type    TEXT,
  p_logistics_subtype TEXT,
  p_item_count        INTEGER
) RETURNS INTEGER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_threshold INTEGER;
  v_key       TEXT;
  v_fee       TEXT;
BEGIN
  SELECT value::INTEGER INTO v_threshold
  FROM public.platform_settings WHERE key = 'free_shipping_threshold';

  -- 滿件免運
  IF v_threshold IS NOT NULL AND p_item_count >= v_threshold THEN
    RETURN 0;
  END IF;

  v_key := CASE
    WHEN p_logistics_type = 'CVS' THEN
      CASE p_logistics_subtype
        WHEN 'UNIMART' THEN 'shipping_fee_cvs_711'
        WHEN 'FAMI'    THEN 'shipping_fee_cvs_family'
        WHEN 'HILIFE'  THEN 'shipping_fee_cvs_hilife'
        WHEN 'OKMART'  THEN 'shipping_fee_cvs_ok'
        ELSE 'shipping_fee_cvs'
      END
    ELSE 'shipping_fee_home'
  END;

  SELECT value INTO v_fee FROM public.platform_settings WHERE key = v_key;

  -- 設定不存在時退回宅配價，再不行才用 60；不要回 0，那等於免費送
  IF v_fee IS NULL THEN
    SELECT value INTO v_fee FROM public.platform_settings WHERE key = 'shipping_fee_home';
  END IF;

  RETURN COALESCE(v_fee::INTEGER, 60);
END;
$$;

COMMENT ON FUNCTION public.calc_delivery_fee IS
  '依 platform_settings 計算單筆出貨運費。前端只用於顯示，實際扣款以此為準。';

-- ── create_delivery_order：改用伺服器算出的運費 ──────────────────────────────
CREATE OR REPLACE FUNCTION public.create_delivery_order(
  p_user_id UUID, p_recipient_name TEXT, p_recipient_phone TEXT, p_address TEXT,
  p_logistics_type TEXT, p_logistics_subtype TEXT, p_store_id TEXT, p_store_name TEXT,
  p_draw_record_ids BIGINT[], p_delivery_fee_points INTEGER
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_order_id BIGINT;
  v_order_number VARCHAR(50);
  v_new_balance INTEGER;
  v_block_count INTEGER;
  v_current_points INTEGER;
  v_item_count INTEGER;
  v_fee INTEGER;
BEGIN
  -- Guard: block preorder items before available date
  SELECT COUNT(1) INTO v_block_count
  FROM draw_records dr
  JOIN products p ON p.id = dr.product_id
  WHERE dr.id = ANY(p_draw_record_ids)
    AND dr.user_id = p_user_id
    AND dr.status = 'in_warehouse'
    AND COALESCE(p.is_preorder, FALSE) = TRUE
    AND (p.preorder_available_at IS NULL OR now() < p.preorder_available_at);

  IF v_block_count > 0 THEN
    RAISE EXCEPTION 'PREORDER_NOT_AVAILABLE';
  END IF;

  -- 只算「真的屬於這個人且還在倉庫」的品項，否則帶一串不存在的 id 就能湊到免運門檻
  SELECT COUNT(1) INTO v_item_count
  FROM draw_records
  WHERE id = ANY(p_draw_record_ids)
    AND user_id = p_user_id
    AND status = 'in_warehouse';

  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'NO_DELIVERABLE_ITEMS';
  END IF;

  -- 運費一律由伺服器算，前端傳來的只當作「畫面上顯示的金額」
  v_fee := public.calc_delivery_fee(p_logistics_type, p_logistics_subtype, v_item_count);

  IF COALESCE(p_delivery_fee_points, -1) <> v_fee THEN
    -- 靜默改價會讓玩家以為被亂扣，寧可擋下來讓前端重新取價
    RAISE EXCEPTION 'FEE_MISMATCH: expected %, got %', v_fee, p_delivery_fee_points;
  END IF;

  IF v_fee > 0 THEN
    SELECT COALESCE(tokens, 0) INTO v_current_points FROM users WHERE id = p_user_id;
    IF v_current_points < v_fee THEN
      RAISE EXCEPTION 'INSUFFICIENT_POINTS';
    END IF;
  END IF;

  UPDATE users
  SET tokens = COALESCE(tokens, 0) - v_fee
  WHERE id = p_user_id
  RETURNING tokens INTO v_new_balance;

  v_order_number := 'OD' || to_char(now(), 'YYMMDD') || lpad(floor(random() * 10000)::text, 4, '0');

  INSERT INTO orders (
    order_number, user_id, recipient_name, recipient_phone, address,
    status, logistics_type, logistics_subtype, store_id, store_name
  ) VALUES (
    v_order_number, p_user_id, p_recipient_name, p_recipient_phone, p_address,
    'submitted', p_logistics_type, p_logistics_subtype, p_store_id, p_store_name
  ) RETURNING id INTO v_order_id;

  UPDATE draw_records
  SET status = 'pending_delivery', order_id = v_order_id
  WHERE id = ANY(p_draw_record_ids) AND user_id = p_user_id AND status = 'in_warehouse';

  INSERT INTO notifications (user_id, type, title, body, link, meta)
  VALUES (
    p_user_id, 'order_status', '配送申請已提交',
    format('您的配送申請已提交，訂單編號：%s', v_order_number),
    '/profile?tab=delivery',
    jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number, 'status', 'submitted')
  );

  RETURN jsonb_build_object(
    'success', true, 'order_id', v_order_id,
    'order_number', v_order_number, 'new_balance', v_new_balance
  );
END;
$function$;
