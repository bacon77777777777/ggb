-- Migration 317: 倉庫30天自動分解函數
-- 對所有 status='in_warehouse' 且存入超過 30 天的品項執行分解
-- 退還代幣使用 token_adjustments（type='dismantle'），並寫入 draw_records 狀態變更

CREATE OR REPLACE FUNCTION auto_dismantle_expired_warehouse_items()
RETURNS TABLE(
  dismantled_count INT,
  total_tokens_refunded INT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_record RECORD;
  v_dismantled INT := 0;
  v_tokens INT := 0;
  v_refund INT;
BEGIN
  -- 找出所有超過30天未申請出貨的倉庫品項（排除機器人帳號）
  FOR v_record IN
    SELECT
      dr.id AS record_id,
      dr.user_id,
      dr.product_id,
      COALESCE(dr.prize_price, 0) AS refund_tokens
    FROM draw_records dr
    JOIN users u ON u.id = dr.user_id
    WHERE dr.status = 'in_warehouse'
      AND dr.created_at < NOW() - INTERVAL '30 days'
      AND (u.is_bot IS NULL OR u.is_bot = false)
    FOR UPDATE OF dr SKIP LOCKED
  LOOP
    v_refund := v_record.refund_tokens;

    -- 更新品項狀態為 dismantled
    UPDATE draw_records
    SET
      status = 'dismantled',
      updated_at = NOW()
    WHERE id = v_record.record_id;

    -- 退還代幣至 token_adjustments
    IF v_refund > 0 THEN
      INSERT INTO token_adjustments (user_id, delta, reason, ref_id, created_at)
      VALUES (
        v_record.user_id,
        v_refund,
        '倉庫逾期自動分解退還',
        v_record.record_id::TEXT,
        NOW()
      );

      -- 更新用戶代幣餘額
      UPDATE users
      SET tokens = GREATEST(0, tokens + v_refund)
      WHERE id = v_record.user_id;
    END IF;

    v_dismantled := v_dismantled + 1;
    v_tokens := v_tokens + v_refund;
  END LOOP;

  RETURN QUERY SELECT v_dismantled, v_tokens;
END;
$$;

COMMENT ON FUNCTION auto_dismantle_expired_warehouse_items() IS
  '倉庫30天自動分解：將 status=in_warehouse 且超過30天未出貨的品項自動分解，退還代幣至用戶帳戶。由 cron/warehouse-dismantle 每日凌晨呼叫。';
