-- Migration to ensure dismantle_prizes RPC is consistent with new recycle_value logic
-- This function relies on product_prizes.recycle_value which is auto-calculated by the trigger in migration 030

BEGIN;

CREATE OR REPLACE FUNCTION dismantle_prizes(
  p_record_ids BIGINT[],
  p_user_id UUID
) RETURNS TABLE (
  success_count INTEGER,
  total_refund INTEGER
) AS $$
DECLARE
  v_record RECORD;
  v_refund INTEGER := 0;
  v_count INTEGER := 0;
  v_prize_value INTEGER;
BEGIN
  -- Loop through records
  FOR v_record IN 
    SELECT dr.id, dr.product_prize_id, pp.recycle_value
    FROM draw_records dr
    JOIN product_prizes pp ON dr.product_prize_id = pp.id
    WHERE dr.id = ANY(p_record_ids)
      AND dr.user_id = p_user_id
      AND dr.status = 'in_warehouse'
  LOOP
    v_prize_value := COALESCE(v_record.recycle_value, 0);
    
    IF v_prize_value > 0 THEN
      -- 1. Update status to dismantled
      UPDATE draw_records SET status = 'dismantled' WHERE id = v_record.id;
      
      -- 2. Insert into Recycle Pool (for admin/reuse logic)
      INSERT INTO admin_recycle_pool (product_prize_id, original_draw_record_id)
      VALUES (v_record.product_prize_id, v_record.id);
      
      -- 3. Add to refund
      v_refund := v_refund + v_prize_value;
      v_count := v_count + 1;
    END IF;
  END LOOP;
  
  -- 4. Update user tokens
  IF v_refund > 0 THEN
    UPDATE users SET tokens = tokens + v_refund WHERE id = p_user_id;
  END IF;
  
  RETURN QUERY SELECT v_count, v_refund;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
