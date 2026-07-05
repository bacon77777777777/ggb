-- Fix create_delivery_order: add balance check before deducting delivery fee
CREATE OR REPLACE FUNCTION create_delivery_order(
  p_user_id UUID,
  p_recipient_name TEXT,
  p_recipient_phone TEXT,
  p_address TEXT,
  p_logistics_type TEXT,
  p_logistics_subtype TEXT,
  p_store_id TEXT,
  p_store_name TEXT,
  p_draw_record_ids BIGINT[],
  p_delivery_fee_points INTEGER
) RETURNS JSONB AS $$
DECLARE
  v_order_id BIGINT;
  v_order_number VARCHAR(50);
  v_new_balance INTEGER;
  v_block_count INTEGER;
  v_current_points INTEGER;
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

  -- Check sufficient token balance when fee > 0
  IF COALESCE(p_delivery_fee_points, 0) > 0 THEN
    SELECT COALESCE(tokens, 0) INTO v_current_points
    FROM users WHERE id = p_user_id;

    IF v_current_points < p_delivery_fee_points THEN
      RAISE EXCEPTION 'INSUFFICIENT_POINTS';
    END IF;
  END IF;

  UPDATE users
  SET tokens = COALESCE(tokens, 0) - COALESCE(p_delivery_fee_points, 0)
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
  SET status = 'pending_delivery',
      order_id = v_order_id
  WHERE id = ANY(p_draw_record_ids) AND user_id = p_user_id;

  INSERT INTO notifications (
    user_id, type, title, body, link, meta
  ) VALUES (
    p_user_id,
    'order_status',
    '配送申請已提交',
    format('您的配送申請已提交，訂單編號：%s', v_order_number),
    '/profile?tab=delivery',
    jsonb_build_object(
      'order_id', v_order_id,
      'order_number', v_order_number,
      'status', 'submitted'
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'new_balance', v_new_balance
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
