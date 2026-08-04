-- 426: 運費入帳、依物流分別設免運門檻、大件加價
--
-- 三個問題一起處理，因為都要動 create_delivery_order：
--
-- 1. 運費扣了不留紀錄
--    原本直接 UPDATE users SET tokens = tokens - fee，orders 沒有運費欄位，
--    也沒寫 token_adjustments。CLAUDE.md 的對帳公式
--      expected = recharge + manual - draw - refund
--    因此漏了運費這一項，每出一筆貨帳就差 60，永遠對不平。
--
-- 2. 免運門檻不分物流
--    超商一箱封頂 65，7 件免運平台吃 65 還算合理；
--    宅配大件真實成本 100~150，7 件免運等於每單虧 100 起跳。
--
-- 3. 大件商品沒有加價
--    hasLargePackage（一番賞／自製賞且該賞項總量 ≤ 3）會強制走宅配，
--    但運費仍收 60，與真實成本脫節。

-- ── 訂單記錄運費 ────────────────────────────────────────────────────────
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_fee INTEGER NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.orders.shipping_fee IS '本筆出貨實收運費（G幣），由伺服器計算';

-- ── 新增設定 ────────────────────────────────────────────────────────────
INSERT INTO public.platform_settings (key, value) VALUES
  ('free_shipping_threshold_cvs',  '7'),    -- 超商：沿用原本的 7 件
  ('free_shipping_threshold_home', '15'),   -- 宅配：門檻拉高，大件單靠件數免運會虧
  ('shipping_fee_home_large',      '120')   -- 含大件的宅配加價
ON CONFLICT (key) DO NOTHING;

-- ── 運費計算：加入大件判斷與分物流門檻 ──────────────────────────────────
DROP FUNCTION IF EXISTS public.calc_delivery_fee(TEXT, TEXT, INTEGER);

CREATE OR REPLACE FUNCTION public.calc_delivery_fee(
  p_logistics_type    TEXT,
  p_logistics_subtype TEXT,
  p_item_count        INTEGER,
  p_has_large         BOOLEAN DEFAULT FALSE
) RETURNS INTEGER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_threshold INTEGER;
  v_key       TEXT;
  v_fee       TEXT;
BEGIN
  -- 免運門檻依物流分開；沒設定就退回舊的單一門檻
  SELECT value::INTEGER INTO v_threshold FROM public.platform_settings
   WHERE key = CASE WHEN p_logistics_type = 'CVS'
                    THEN 'free_shipping_threshold_cvs'
                    ELSE 'free_shipping_threshold_home' END;
  IF v_threshold IS NULL THEN
    SELECT value::INTEGER INTO v_threshold FROM public.platform_settings
     WHERE key = 'free_shipping_threshold';
  END IF;

  -- 大件一律不免運：一箱真實成本就超過門檻能攤提的範圍
  IF NOT COALESCE(p_has_large, FALSE)
     AND v_threshold IS NOT NULL AND p_item_count >= v_threshold THEN
    RETURN 0;
  END IF;

  IF COALESCE(p_has_large, FALSE) THEN
    v_key := 'shipping_fee_home_large';
  ELSIF p_logistics_type = 'CVS' THEN
    v_key := CASE p_logistics_subtype
      WHEN 'UNIMART' THEN 'shipping_fee_cvs_711'
      WHEN 'FAMI'    THEN 'shipping_fee_cvs_family'
      WHEN 'HILIFE'  THEN 'shipping_fee_cvs_hilife'
      WHEN 'OKMART'  THEN 'shipping_fee_cvs_ok'
      ELSE 'shipping_fee_cvs'
    END;
  ELSE
    v_key := 'shipping_fee_home';
  END IF;

  SELECT value INTO v_fee FROM public.platform_settings WHERE key = v_key;
  IF v_fee IS NULL THEN
    SELECT value INTO v_fee FROM public.platform_settings WHERE key = 'shipping_fee_home';
  END IF;

  -- 設定全缺時退 60，不要回 0 —— 那等於免費送
  RETURN COALESCE(v_fee::INTEGER, 60);
END;
$$;

COMMENT ON FUNCTION public.calc_delivery_fee IS
  '依 platform_settings 計算出貨運費。含大件時不適用免運且走大件價。前端只用於顯示，實際扣款以此為準。';

-- ── 判斷一批品項是否含大件 ──────────────────────────────────────────────
-- 與前台 hasLargePackage 同一套規則：一番賞／自製賞，且該賞項總量 ≤ 3
CREATE OR REPLACE FUNCTION public.delivery_has_large_item(
  p_user_id UUID, p_draw_record_ids BIGINT[]
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM draw_records dr
    JOIN products p       ON p.id  = dr.product_id
    LEFT JOIN product_prizes pp ON pp.id = dr.product_prize_id
    WHERE dr.id = ANY(p_draw_record_ids)
      AND dr.user_id = p_user_id
      AND dr.status = 'in_warehouse'
      AND p.type IN ('ichiban', 'custom')
      AND COALESCE(pp.total, 999) <= 3
  );
$$;

-- ── create_delivery_order：運費入帳 + 大件判斷 ──────────────────────────
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
  v_has_large BOOLEAN;
  v_fee INTEGER;
BEGIN
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

  -- 只算確實屬於本人且仍在倉庫的品項，否則帶一串不存在的 id 就能湊到免運門檻
  SELECT COUNT(1) INTO v_item_count
  FROM draw_records
  WHERE id = ANY(p_draw_record_ids) AND user_id = p_user_id AND status = 'in_warehouse';

  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'NO_DELIVERABLE_ITEMS';
  END IF;

  v_has_large := public.delivery_has_large_item(p_user_id, p_draw_record_ids);

  -- 含大件強制宅配：前台會擋，但直接打 RPC 的人不會
  IF v_has_large AND p_logistics_type <> 'HOME' THEN
    RAISE EXCEPTION 'LARGE_ITEM_REQUIRES_HOME_DELIVERY';
  END IF;

  v_fee := public.calc_delivery_fee(p_logistics_type, p_logistics_subtype, v_item_count, v_has_large);

  -- 前端傳來的只當作「畫面顯示的金額」，不一致就擋下請重新取價；
  -- 靜默改價會讓玩家以為被亂扣
  IF COALESCE(p_delivery_fee_points, -1) <> v_fee THEN
    RAISE EXCEPTION 'FEE_MISMATCH: expected %, got %', v_fee, p_delivery_fee_points;
  END IF;

  IF v_fee > 0 THEN
    SELECT COALESCE(tokens, 0) INTO v_current_points FROM users WHERE id = p_user_id;
    IF v_current_points < v_fee THEN
      RAISE EXCEPTION 'INSUFFICIENT_POINTS';
    END IF;
  END IF;

  UPDATE users SET tokens = COALESCE(tokens, 0) - v_fee
  WHERE id = p_user_id RETURNING tokens INTO v_new_balance;

  v_order_number := 'OD' || to_char(now(), 'YYMMDD') || lpad(floor(random() * 10000)::text, 4, '0');

  INSERT INTO orders (
    order_number, user_id, recipient_name, recipient_phone, address,
    status, logistics_type, logistics_subtype, store_id, store_name, shipping_fee
  ) VALUES (
    v_order_number, p_user_id, p_recipient_name, p_recipient_phone, p_address,
    'submitted', p_logistics_type, p_logistics_subtype, p_store_id, p_store_name, v_fee
  ) RETURNING id INTO v_order_id;

  -- 運費入帳。不寫的話對帳公式會少這一項，每出一筆貨帳就差一次
  IF v_fee > 0 THEN
    INSERT INTO token_adjustments (user_id, delta, reason, created_by)
    VALUES (p_user_id, -v_fee, format('出貨運費（訂單 %s）', v_order_number), 'system:delivery');
  END IF;

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
    'order_number', v_order_number, 'new_balance', v_new_balance,
    'shipping_fee', v_fee
  );
END;
$function$;
