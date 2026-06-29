-- Fix data inconsistency for 'Hololive Production Vol.4'
-- Problem: products.remaining and product_prizes.remaining do not match the actual unsold tickets calculated from draw_records.
-- Solution: Recalculate remaining counts based on draw_records (the source of truth for sales).

DO $$
DECLARE
  v_product_id BIGINT;
  v_total_count INTEGER;
  v_sold_count INTEGER;
  v_actual_remaining INTEGER;
  v_prize_record RECORD;
  v_prize_sold_count INTEGER;
  v_prize_total INTEGER;
BEGIN
  -- 1. Find the product
  SELECT id, total_count INTO v_product_id, v_total_count 
  FROM products 
  WHERE name LIKE '%Hololive Production Vol.4%' 
  LIMIT 1;
  
  IF v_product_id IS NOT NULL THEN
    RAISE NOTICE 'Fixing data for Product ID: %', v_product_id;

    -- 2. Update Product Remaining
    -- Count sold tickets (excluding Last One which is ticket_number 0)
    SELECT count(*) INTO v_sold_count 
    FROM draw_records 
    WHERE product_id = v_product_id AND ticket_number > 0;
    
    v_actual_remaining := v_total_count - v_sold_count;
    
    UPDATE products 
    SET remaining = v_actual_remaining 
    WHERE id = v_product_id;
    
    RAISE NOTICE 'Updated Product Remaining to: % (Total: %, Sold: %)', v_actual_remaining, v_total_count, v_sold_count;

    -- 3. Update Product Prizes Remaining
    FOR v_prize_record IN SELECT id, total, level FROM product_prizes WHERE product_id = v_product_id LOOP
      -- Count sold prizes for this specific prize type
      SELECT count(*) INTO v_prize_sold_count 
      FROM draw_records 
      WHERE product_prize_id = v_prize_record.id;
      
      -- Update remaining
      UPDATE product_prizes 
      SET remaining = GREATEST(0, v_prize_record.total - v_prize_sold_count)
      WHERE id = v_prize_record.id;
      
      RAISE NOTICE 'Updated Prize % (Level %) Remaining: %', v_prize_record.id, v_prize_record.level, (v_prize_record.total - v_prize_sold_count);
    END LOOP;
    
  ELSE
    RAISE NOTICE 'Product not found';
  END IF;
END $$;
