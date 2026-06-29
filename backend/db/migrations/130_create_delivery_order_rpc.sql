-- Create RPC for creating delivery order with points deduction
BEGIN;

-- Drop existing function if exists to avoid conflicts
DROP FUNCTION IF EXISTS create_delivery_order(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT[], INTEGER);

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
  v_user_points INTEGER;
  v_order_number VARCHAR(50);
  v_order_id BIGINT;
  v_new_balance INTEGER;
  v_item_count INTEGER;
BEGIN
  -- 1. Check if items are valid (in_warehouse)
  SELECT COUNT(*) INTO v_item_count 
  FROM draw_records 
  WHERE id = ANY(p_draw_record_ids) 
    AND user_id = p_user_id 
    AND status = 'in_warehouse';
    
  IF v_item_count != array_length(p_draw_record_ids, 1) THEN
    RETURN jsonb_build_object('success', false, 'message', '部分商品狀態異常，請重新整理頁面');
  END IF;

  -- 2. Deduct points (Atomic update with check)
  UPDATE users 
  SET points = points - p_delivery_fee_points 
  WHERE id = p_user_id AND points >= p_delivery_fee_points
  RETURNING points INTO v_new_balance;
  
  IF v_new_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '積分不足，無法支付運費');
  END IF;

  -- 3. Generate Order Number: OD + YYMMDD + 4 random digits
  v_order_number := 'OD' || to_char(now(), 'YYMMDD') || lpad(floor(random() * 10000)::text, 4, '0');

  -- 4. Create Order
  INSERT INTO orders (
    order_number,
    user_id,
    recipient_name,
    recipient_phone,
    address,
    status,
    logistics_type,
    logistics_subtype,
    store_id,
    store_name
  ) VALUES (
    v_order_number,
    p_user_id,
    p_recipient_name,
    p_recipient_phone,
    p_address,
    'submitted',
    p_logistics_type,
    p_logistics_subtype,
    p_store_id,
    p_store_name
  ) RETURNING id INTO v_order_id;

  -- 5. Update Draw Records
  UPDATE draw_records
  SET status = 'pending_delivery',
      order_id = v_order_id
  WHERE id = ANY(p_draw_record_ids) AND user_id = p_user_id;

  -- 6. Create Notification
  INSERT INTO notifications (
    user_id,
    type,
    title,
    body,
    link,
    meta
  ) VALUES (
    p_user_id,
    'order_status',
    '配送申請已提交',
    format('您的配送申請已提交，訂單編號：%s，扣除運費 %s 積分', v_order_number, p_delivery_fee_points),
    '/profile?tab=delivery',
    jsonb_build_object(
      'order_id', v_order_id,
      'order_number', v_order_number,
      'status', 'submitted',
      'deducted_points', p_delivery_fee_points,
      'new_balance', v_new_balance
    )
  );

  RETURN jsonb_build_object(
    'success', true, 
    'order_id', v_order_id,
    'order_number', v_order_number,
    'new_balance', v_new_balance
  );
EXCEPTION WHEN OTHERS THEN
  -- Re-raise exception for client to handle or return error json
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
