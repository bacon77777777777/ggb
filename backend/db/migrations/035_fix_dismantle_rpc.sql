-- Fix dismantle_prizes RPC function to use correct column (total instead of quantity)
-- and ensure token balance is updated correctly.

BEGIN;

-- 1. Update dismantle_prizes RPC function
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
    SELECT dr.id, dr.product_prize_id, pp.recycle_value, pp.total, p.price
    FROM draw_records dr
    JOIN product_prizes pp ON dr.product_prize_id = pp.id
    JOIN products p ON pp.product_id = p.id
    WHERE dr.id = ANY(p_record_ids)
      AND dr.user_id = p_user_id
      AND dr.status = 'in_warehouse'
  LOOP
    v_prize_value := COALESCE(v_record.recycle_value, 0);
    
    -- Fallback calculation if value is 0 (double check logic)
    IF v_prize_value = 0 THEN
       -- Logic: Top prizes (total <= 4) get half price, others get 50
       IF v_record.total > 0 AND v_record.total <= 4 THEN
          v_prize_value := FLOOR(v_record.price / 2);
       ELSE
          v_prize_value := 50;
       END IF;
    END IF;
    
    IF v_prize_value > 0 THEN
      -- 1. Update status to dismantled
      UPDATE draw_records SET status = 'dismantled' WHERE id = v_record.id;
      
      -- 2. Insert into Recycle Pool
      INSERT INTO admin_recycle_pool (product_prize_id, original_draw_record_id)
      VALUES (v_record.product_prize_id, v_record.id);
      
      -- 3. Add to refund
      v_refund := v_refund + v_prize_value;
      v_count := v_count + 1;
    END IF;
  END LOOP;
  
  -- 4. Update user tokens
  IF v_refund > 0 THEN
    UPDATE users SET tokens = COALESCE(tokens, 0) + v_refund WHERE id = p_user_id;
  END IF;
  
  RETURN QUERY SELECT v_count, v_refund;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update existing product_prizes values to ensure they are correct
UPDATE product_prizes pp
SET recycle_value = CASE 
  WHEN pp.total > 0 AND pp.total <= 4 THEN (
    SELECT FLOOR(COALESCE(p.price, 0) / 2)
    FROM products p 
    WHERE p.id = pp.product_id
  )
  ELSE 50
END;

COMMIT;
