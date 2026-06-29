BEGIN;

-- Add updated_at column if not exists
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recharge_records' AND column_name = 'updated_at') THEN
        ALTER TABLE recharge_records ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- 1. Create function to initiate a topup order (pending)
CREATE OR REPLACE FUNCTION create_topup_order(
  p_amount DECIMAL,
  p_bonus DECIMAL
) RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_order_number VARCHAR(50);
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Generate order number: TP + YYMMDD + 4 digits
  v_order_number := 'TP' || to_char(now(), 'YYMMDD') || lpad(floor(random() * 10000)::text, 4, '0');
  
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
    'pending'
  );

  RETURN json_build_object(
    'success', true,
    'order_number', v_order_number
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION create_topup_order(DECIMAL, DECIMAL) TO authenticated;

-- 2. Create function to confirm a topup order (success)
-- This should be called by the backend webhook handler using service role key
CREATE OR REPLACE FUNCTION confirm_topup_order(
  p_order_number VARCHAR
) RETURNS JSON AS $$
DECLARE
  v_record RECORD;
  v_total_tokens INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Find the pending record
  SELECT * INTO v_record 
  FROM recharge_records 
  WHERE order_number = p_order_number 
    AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Check if already success to make idempotent
    IF EXISTS (SELECT 1 FROM recharge_records WHERE order_number = p_order_number AND status = 'success') THEN
       RETURN json_build_object('success', true, 'message', 'Already confirmed');
    END IF;
    RAISE EXCEPTION 'Order not found or not pending';
  END IF;

  v_total_tokens := v_record.amount + v_record.bonus;

  -- Update status
  UPDATE recharge_records
  SET status = 'success',
      updated_at = NOW()
  WHERE id = v_record.id;

  -- Add tokens to user
  UPDATE users
  SET tokens = tokens + v_total_tokens
  WHERE id = v_record.user_id
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
    v_record.user_id,
    'topup',
    '儲值成功通知',
    format('您成功儲值 %s 元，獲得 %s 代幣（含贈送 %s）', v_record.amount, v_total_tokens, v_record.bonus),
    '/profile?tab=topup-history',
    jsonb_build_object(
      'order_number', p_order_number,
      'amount', v_record.amount,
      'bonus', v_record.bonus,
      'added_tokens', v_total_tokens,
      'new_balance', v_new_balance
    )
  );

  RETURN json_build_object(
    'success', true,
    'order_number', p_order_number,
    'new_balance', v_new_balance
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
