-- 190_payment_fee.sql
-- 儲值紀錄加入藍新實際手續費欄位，於 callback 時依付款方式計算儲存

ALTER TABLE recharge_records ADD COLUMN IF NOT EXISTS payment_fee INTEGER;

-- 更新 confirm_topup_order：接收並儲存實際手續費
CREATE OR REPLACE FUNCTION confirm_topup_order(
  p_order_number VARCHAR,
  p_trade_no     TEXT    DEFAULT NULL,
  p_payment_type TEXT    DEFAULT NULL,
  p_payment_fee  INTEGER DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_record       RECORD;
  v_total_tokens INTEGER;
  v_new_balance  INTEGER;
BEGIN
  SELECT * INTO v_record
  FROM recharge_records
  WHERE order_number = p_order_number
    AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM recharge_records WHERE order_number = p_order_number AND status = 'success') THEN
      RETURN json_build_object('success', true, 'message', 'Already confirmed');
    END IF;
    RAISE EXCEPTION 'Order not found or not pending';
  END IF;

  v_total_tokens := v_record.amount + v_record.bonus;

  UPDATE recharge_records
  SET status         = 'success',
      trade_no       = COALESCE(p_trade_no, trade_no),
      payment_method = COALESCE(p_payment_type, payment_method),
      payment_fee    = COALESCE(p_payment_fee, payment_fee),
      updated_at     = NOW()
  WHERE id = v_record.id;

  UPDATE users
  SET tokens = tokens + v_total_tokens
  WHERE id = v_record.user_id
  RETURNING tokens INTO v_new_balance;

  INSERT INTO notifications (user_id, type, title, body, link, meta)
  VALUES (
    v_record.user_id,
    'topup',
    '儲值成功通知',
    format('您成功儲值 %s 元，獲得 %s 代幣（含贈送 %s）', v_record.amount, v_total_tokens, v_record.bonus),
    '/profile?tab=topup-history',
    jsonb_build_object(
      'order_number', p_order_number,
      'amount',       v_record.amount,
      'bonus',        v_record.bonus,
      'added_tokens', v_total_tokens,
      'new_balance',  v_new_balance
    )
  );

  RETURN json_build_object(
    'success',      true,
    'order_number', p_order_number,
    'new_balance',  v_new_balance
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
