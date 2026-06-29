-- 1. Add recycle_value to product_prizes if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_prizes' AND column_name = 'recycle_value') THEN
        ALTER TABLE product_prizes ADD COLUMN recycle_value INTEGER DEFAULT 0;
    END IF;
END $$;

-- 2. Populate default recycle values (Example values, can be adjusted)
UPDATE product_prizes SET recycle_value = 
  CASE 
    WHEN level IN ('SP', 'Last One', 'LAST ONE') THEN 300
    WHEN level = 'A' THEN 200
    WHEN level = 'B' THEN 150
    WHEN level = 'C' THEN 100
    ELSE 50
  END
WHERE recycle_value = 0 OR recycle_value IS NULL;

-- 3. Update draw_records status check constraint to include 'dismantled'
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Find the constraint name for status check
    SELECT conname INTO r
    FROM pg_constraint 
    WHERE conrelid = 'draw_records'::regclass 
    AND contype = 'c' 
    AND pg_get_constraintdef(oid) LIKE '%status%';

    IF FOUND THEN
        -- Drop the existing constraint
        EXECUTE 'ALTER TABLE draw_records DROP CONSTRAINT ' || r.conname;
    END IF;

    -- Add the new constraint
    ALTER TABLE draw_records ADD CONSTRAINT draw_records_status_check 
    CHECK (status IN ('in_warehouse', 'pending_delivery', 'shipped', 'exchanged', 'dismantled'));
END $$;

-- 4. Create or replace dismantle_prizes function
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
    END IF;
  END LOOP;
  
  -- Update user tokens
  IF v_refund > 0 THEN
    UPDATE users SET tokens = tokens + v_refund WHERE id = p_user_id;
    -- Also update profiles if you are maintaining it
    -- UPDATE profiles SET points = points + v_refund WHERE id = p_user_id;
  END IF;
  
  RETURN QUERY SELECT v_count, v_refund;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
