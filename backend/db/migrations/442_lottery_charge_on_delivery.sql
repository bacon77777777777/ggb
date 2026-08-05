-- 442: 申請寄出時收取抽籤販售的價金
--
-- 抽的時候 0 元，中籤品項要寄出才付錢，所以價金必須在 create_delivery_order 收。
--
-- 兩件事刻意分開：
--   運費   → token_adjustments 記 'system:delivery'
--   價金   → token_adjustments 記 'system:lottery'
-- 合在一起寫的話，對帳時分不出哪筆是物流成本、哪筆是商品收入。
--
-- 價金一律由伺服器用 lottery_purchase_total() 算。前端傳來的
-- p_delivery_fee_points 只涵蓋運費（維持 425 的驗算），價金不讓前端有機會少報。

CREATE OR REPLACE FUNCTION public.create_delivery_order(p_user_id uuid, p_recipient_name text, p_recipient_phone text, p_address text, p_logistics_type text, p_logistics_subtype text, p_store_id text, p_store_name text, p_draw_record_ids bigint[], p_delivery_fee_points integer)
 RETURNS jsonb
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
  v_purchase INTEGER;
  v_charge INTEGER;
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

  -- 抽籤販售中籤的品項，價金在這一刻才收（抽的時候是 0 元）。
  -- 前端傳來的 p_delivery_fee_points 只涵蓋運費，價金一律由伺服器算，
  -- 不讓前端有機會少報。
  v_purchase := public.lottery_purchase_total(p_user_id, p_draw_record_ids);
  v_charge   := v_fee + v_purchase;

  -- 前端傳來的只當作「畫面顯示的金額」，不一致就擋下請重新取價；
  -- 靜默改價會讓玩家以為被亂扣
  IF COALESCE(p_delivery_fee_points, -1) <> v_fee THEN
    RAISE EXCEPTION 'FEE_MISMATCH: expected %, got %', v_fee, p_delivery_fee_points;
  END IF;

  IF v_charge > 0 THEN
    SELECT COALESCE(tokens, 0) INTO v_current_points FROM users WHERE id = p_user_id;
    IF v_current_points < v_charge THEN
      RAISE EXCEPTION 'INSUFFICIENT_POINTS';
    END IF;
  END IF;

  UPDATE users SET tokens = COALESCE(tokens, 0) - v_charge
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

  IF v_purchase > 0 THEN
    INSERT INTO token_adjustments (user_id, delta, reason, created_by)
    VALUES (p_user_id, -v_purchase, format('抽籤販售價金（訂單 %s）', v_order_number), 'system:lottery');
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
    'shipping_fee', v_fee,
    'purchase_total', v_purchase
  );
END;
$function$

;
