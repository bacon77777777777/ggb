-- Create process_topup RPC function
BEGIN;

CREATE OR REPLACE FUNCTION process_topup(
  p_amount DECIMAL,
  p_bonus DECIMAL
) RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_order_number VARCHAR(50);
  v_total_tokens INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Get current user ID
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Generate order number: TP + YYMMDD + 4 digits
  v_order_number := 'TP' || to_char(now(), 'YYMMDD') || lpad(floor(random() * 10000)::text, 4, '0');
  
  -- Calculate total tokens to add (assuming 1 TWD = 1 Token base rate)
  v_total_tokens := p_amount + p_bonus;

  -- Insert into recharge_records
  INSERT INTO recharge_records (
    order_number,
    user_id,
    amount,
    bonus,
    status
  ) VALUES (
    v_order_number,
    v_user_id,
    p_amount,
    p_bonus,
    'success'
  );

  -- Update user tokens
  UPDATE users
  SET tokens = tokens + v_total_tokens
  WHERE id = v_user_id
  RETURNING tokens INTO v_new_balance;

  RETURN json_build_object(
    'success', true,
    'order_number', v_order_number,
    'added_tokens', v_total_tokens,
    'new_balance', v_new_balance
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
