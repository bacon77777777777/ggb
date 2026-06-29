-- Add recycle_value to product_prizes and create dismantle function

BEGIN;

-- 1. Add recycle_value column
ALTER TABLE product_prizes ADD COLUMN IF NOT EXISTS recycle_value INTEGER DEFAULT 0;

-- 2. Populate default recycle values for testing
UPDATE product_prizes SET recycle_value = 
  CASE 
    WHEN level IN ('SP', 'Last One') THEN 300
    WHEN level = 'A' THEN 200
    WHEN level = 'B' THEN 150
    WHEN level = 'C' THEN 100
    ELSE 50
  END
WHERE recycle_value = 0;

-- 3. Update draw_records status constraint to include 'dismantled'
-- First drop existing check if possible (name might vary, so we use a safe approach or just trust it accepts text)
-- If it's a check constraint, we need to know the name. 
-- Usually created as draw_records_status_check.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'draw_records_status_check') THEN
    ALTER TABLE draw_records DROP CONSTRAINT draw_records_status_check;
  END IF;
END $$;

ALTER TABLE draw_records ADD CONSTRAINT draw_records_status_check 
  CHECK (status IN ('in_warehouse', 'pending_delivery', 'shipped', 'exchanged', 'dismantled'));

-- 4. Create dismantle function
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
      -- Update status
      UPDATE draw_records SET status = 'dismantled' WHERE id = v_record.id;
      
      -- Add to refund
      v_refund := v_refund + v_prize_value;
      v_count := v_count + 1;
      
      -- Create a record in recharge_records for log (optional, keeping it simple for now)
      -- Or maybe insert into a new 'wallet_transactions' table if it existed.
      -- For now, we rely on users table update.
    END IF;
  END LOOP;
  
  -- Update user tokens
  IF v_refund > 0 THEN
    UPDATE users SET tokens = tokens + v_refund WHERE id = p_user_id;
  END IF;
  
  RETURN QUERY SELECT v_count, v_refund;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
