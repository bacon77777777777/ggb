-- Create process_test_topup RPC function for testing purposes
BEGIN;

CREATE OR REPLACE FUNCTION process_test_topup(
  p_amount DECIMAL,
  p_bonus DECIMAL
) RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_order_number VARCHAR(50);
  v_total_tokens INTEGER;
  v_new_balance INTEGER;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Generate order number: TEST + YYMMDD + 4 digits
  v_order_number := 'TEST' || to_char(now(), 'YYMMDD') || lpad(floor(random() * 10000)::text, 4, '0');
  
  v_total_tokens := p_amount + p_bonus;

  -- Insert into recharge_records
  INSERT INTO recharge_records (
    order_number,
    user_id,
    amount,
    bonus,
    status,
    payment_method,
    updated_at
  ) VALUES (
    v_order_number,
    v_user_id,
    p_amount,
    p_bonus,
    'success',
    'other',
    NOW()
  );

  -- Update user tokens
  UPDATE users
  SET tokens = tokens + v_total_tokens
  WHERE id = v_user_id
  RETURNING tokens INTO v_new_balance;

  -- Send notification
  INSERT INTO notifications (
    user_id,
    type,
    title,
    body,
    link,
    meta
  )
  VALUES (
    v_user_id,
    'topup',
    '測試儲值成功通知',
    format('您成功儲值 %s 元，獲得 %s 代幣（含贈送 %s）', p_amount, v_total_tokens, p_bonus),
    '/profile?tab=topup-history',
    jsonb_build_object(
      'order_number', v_order_number,
      'amount', p_amount,
      'bonus', p_bonus,
      'added_tokens', v_total_tokens,
      'new_balance', v_new_balance
    )
  );

  RETURN json_build_object(
    'success', true,
    'order_number', v_order_number,
    'added_tokens', v_total_tokens,
    'new_balance', v_new_balance
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION process_test_topup(DECIMAL, DECIMAL) TO authenticated;

COMMIT;
