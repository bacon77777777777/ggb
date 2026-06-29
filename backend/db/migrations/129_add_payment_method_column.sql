BEGIN;

-- 1. Add payment_method column to recharge_records
ALTER TABLE recharge_records ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50);

-- 2. Drop old function to avoid ambiguity
DROP FUNCTION IF EXISTS create_topup_order(DECIMAL, DECIMAL);

-- 3. Update create_topup_order function to accept payment_method
CREATE OR REPLACE FUNCTION create_topup_order(
  p_amount DECIMAL,
  p_bonus DECIMAL,
  p_payment_method VARCHAR DEFAULT NULL
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
    status,
    payment_method
  ) VALUES (
    v_order_number,
    v_user_id,
    p_amount,
    p_bonus,
    'pending',
    p_payment_method
  );

  RETURN json_build_object(
    'success', true,
    'order_number', v_order_number
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-grant execute permission just in case
GRANT EXECUTE ON FUNCTION create_topup_order(DECIMAL, DECIMAL, VARCHAR) TO authenticated;

COMMIT;
