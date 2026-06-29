BEGIN;

-- 1. Update calculate_recycle_value function
CREATE OR REPLACE FUNCTION calculate_recycle_value() RETURNS TRIGGER AS $$
DECLARE
  v_product_price INTEGER;
BEGIN
  -- Get product price
  SELECT price INTO v_product_price FROM products WHERE id = NEW.product_id;
  
  -- If product not found (shouldn't happen due to FK), default to 0
  v_product_price := COALESCE(v_product_price, 0);

  -- Apply logic: 
  -- If total quantity is 1-4 (High Tier), value is 0.5x product price (half single draw)
  -- Otherwise (Low Tier), value is 50
  IF NEW.total > 0 AND NEW.total <= 4 THEN
    NEW.recycle_value := FLOOR(v_product_price / 2);
  ELSE
    NEW.recycle_value := 50;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Update dismantle_prizes RPC function
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
    SELECT dr.id, dr.product_prize_id, pp.recycle_value, pp.quantity, p.price
    FROM draw_records dr
    JOIN product_prizes pp ON dr.product_prize_id = pp.id
    JOIN products p ON pp.product_id = p.id
    WHERE dr.id = ANY(p_record_ids)
      AND dr.user_id = p_user_id
      AND dr.status = 'in_warehouse'
  LOOP
    v_prize_value := COALESCE(v_record.recycle_value, 0);
    
    -- Fallback calculation if value is 0
    IF v_prize_value = 0 THEN
       IF v_record.quantity BETWEEN 1 AND 4 THEN
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
    UPDATE users SET tokens = tokens + v_refund WHERE id = p_user_id;
  END IF;
  
  RETURN QUERY SELECT v_count, v_refund;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update existing product_prizes values
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
