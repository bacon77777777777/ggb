-- Unify play_ichiban function to use draw_records and product_prizes
-- This aligns the backend logic with the unified schema

CREATE OR REPLACE FUNCTION public.play_ichiban(p_product_id BIGINT, p_ticket_numbers INTEGER[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_product_price INTEGER;
  v_prize RECORD;
  v_last_one_prize RECORD;
  v_prizes_drawn JSONB := '[]'::jsonb;
  v_ticket_no INTEGER;
  v_normal_qty INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if tickets are already taken in draw_records
  FOREACH v_ticket_no IN ARRAY p_ticket_numbers LOOP
    IF EXISTS (SELECT 1 FROM draw_records WHERE product_id = p_product_id AND ticket_number = v_ticket_no) THEN
      RAISE EXCEPTION 'Ticket % is already sold', v_ticket_no;
    END IF;
  END LOOP;

  -- Get product price
  SELECT price INTO v_product_price FROM products WHERE id = p_product_id;
  IF v_product_price IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  -- Process each ticket
  FOREACH v_ticket_no IN ARRAY p_ticket_numbers LOOP
    -- Pick a random prize (EXCLUDING Last One)
    -- Using product_prizes table
    SELECT * INTO v_prize FROM product_prizes 
    WHERE product_id = p_product_id AND remaining > 0 AND level != 'Last One'
    ORDER BY random() * probability DESC
    LIMIT 1;

    IF v_prize IS NULL THEN
      RAISE EXCEPTION 'No prizes left';
    END IF;

    -- Decrement quantity
    UPDATE product_prizes SET remaining = remaining - 1 WHERE id = v_prize.id;
    UPDATE products SET remaining_count = remaining_count - 1 WHERE id = p_product_id;

    -- Record in draw_records
    -- Mapping: prize_level -> v_prize.level, product_prize_id -> v_prize.id
    INSERT INTO draw_records (user_id, product_id, product_prize_id, ticket_number, prize_level, status)
    VALUES (v_user_id, p_product_id, v_prize.id, v_ticket_no, v_prize.level, 'in_warehouse');

    -- Add to result
    v_prizes_drawn := v_prizes_drawn || jsonb_build_object(
      'grade', v_prize.level,
      'name', v_prize.name,
      'image_url', v_prize.image_url,
      'ticket_no', v_ticket_no
    );

    -- Check for Last One
    SELECT COALESCE(SUM(remaining), 0) INTO v_normal_qty FROM product_prizes 
    WHERE product_id = p_product_id AND level != 'Last One';
    
    IF v_normal_qty = 0 THEN
        SELECT * INTO v_last_one_prize FROM product_prizes 
        WHERE product_id = p_product_id AND level = 'Last One' AND remaining > 0
        LIMIT 1;

        IF v_last_one_prize IS NOT NULL THEN
            UPDATE product_prizes SET remaining = 0 WHERE id = v_last_one_prize.id;
            UPDATE products SET remaining_count = 0 WHERE id = p_product_id;

            -- Insert Last One record (ticket_number 0)
            INSERT INTO draw_records (user_id, product_id, product_prize_id, ticket_number, prize_level, status)
            VALUES (v_user_id, p_product_id, v_last_one_prize.id, 0, v_last_one_prize.level, 'in_warehouse');

            v_prizes_drawn := v_prizes_drawn || jsonb_build_object(
              'grade', v_last_one_prize.level,
              'name', v_last_one_prize.name,
              'image_url', v_last_one_prize.image_url,
              'is_last_one', true
            );
        END IF;
    END IF;

  END LOOP;

  RETURN v_prizes_drawn;
END;
$$;
