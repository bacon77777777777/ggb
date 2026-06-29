-- Fix play_ichiban function to use correct tables and columns
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
  v_count INTEGER;
  v_normal_qty INTEGER;
  v_seed TEXT;
  v_nonce INTEGER;
  v_hash TEXT;
  v_random NUMERIC;
  v_product_seed TEXT;
  v_total_tickets INTEGER;
  v_major_count INTEGER;
  v_step INTEGER := 1;
  v_positions INTEGER[] := ARRAY[]::INTEGER[];
  v_positions_count INTEGER := 0;
  v_prize_number INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT price, seed, total_count INTO v_product_price, v_product_seed, v_total_tickets
  FROM products WHERE id = p_product_id;
  IF v_product_price IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  v_count := array_length(p_ticket_numbers, 1);
  IF v_count IS NULL OR v_count = 0 THEN
     RAISE EXCEPTION 'No tickets selected';
  END IF;

  SELECT COALESCE(SUM(total), 0) INTO v_major_count
  FROM product_prizes
  WHERE product_id = p_product_id
    AND (level LIKE 'SP%' OR level LIKE 'A%' OR level LIKE 'B%' OR level LIKE 'C%');

  IF v_product_seed IS NOT NULL AND v_total_tickets IS NOT NULL AND v_total_tickets > 0 AND v_major_count > 0 THEN
    v_step := 1;
    v_positions := ARRAY[]::INTEGER[];
    v_positions_count := 0;
    WHILE v_step <= v_total_tickets AND v_positions_count < v_major_count LOOP
      v_prize_number := (abs(hashtext(v_product_seed || '-' || v_step::text)) % v_total_tickets) + 1;
      IF v_prize_number <> ALL (v_positions) THEN
        v_positions := array_append(v_positions, v_prize_number);
        v_positions_count := v_positions_count + 1;
      END IF;
      v_step := v_step + 1;
    END LOOP;
  END IF;

  FOREACH v_ticket_no IN ARRAY p_ticket_numbers LOOP
    -- Check if ticket is already taken
    IF EXISTS (SELECT 1 FROM draw_records WHERE product_id = p_product_id AND ticket_number = v_ticket_no) THEN
        RAISE EXCEPTION 'Ticket % is already sold', v_ticket_no;
    END IF;

    -- Check remaining normal prizes BEFORE selecting
    SELECT COALESCE(SUM(remaining), 0) INTO v_normal_qty FROM product_prizes 
    WHERE product_id = p_product_id AND level != 'Last One' AND level != 'LAST ONE';
    
    -- If no normal prizes left, award Last One and stop further draws in this batch
    IF v_normal_qty = 0 THEN
        SELECT * INTO v_last_one_prize FROM product_prizes 
        WHERE product_id = p_product_id AND (level = 'Last One' OR level = 'LAST ONE') AND remaining > 0
        LIMIT 1;

        IF v_last_one_prize IS NOT NULL THEN
            -- Update Last One quantity
            UPDATE product_prizes SET remaining = 0 WHERE id = v_last_one_prize.id;
            
            -- Force product remaining to 0
            UPDATE products SET remaining = 0 WHERE id = p_product_id;

            -- Generate TXID for Last One
            v_seed := md5(random()::text || clock_timestamp()::text);
            v_nonce := floor(random() * 1000000)::int;
            v_hash := md5(v_seed || v_nonce::text);
            v_random := random();

            -- Record Last One in draw_records
            INSERT INTO draw_records (
                user_id, product_id, ticket_number, prize_level, prize_name,
                txid_seed, txid_nonce, txid_hash, random_value, profit_rate
            )
            VALUES (
                v_user_id, p_product_id, 0, v_last_one_prize.level, v_last_one_prize.name,
                v_seed, v_nonce, v_hash, v_random, 1.0
            );

            -- Add to result
            v_prizes_drawn := v_prizes_drawn || jsonb_build_object(
              'grade', v_last_one_prize.level,
              'name', v_last_one_prize.name,
              'image_url', v_last_one_prize.image_url,
              'is_last_one', true
            );

            -- After awarding Last One, there are truly no prizes left;
            -- exit the ticket loop to avoid 'No prizes left' error on extra tickets
            EXIT;
        END IF;
    END IF;

    v_prize := NULL;

    -- Try to take a major prize on pre-assigned positions
    IF v_positions_count > 0 AND v_ticket_no = ANY (v_positions) THEN
      SELECT * INTO v_prize FROM product_prizes 
      WHERE product_id = p_product_id AND remaining > 0 
        AND (level LIKE 'SP%' OR level LIKE 'A%' OR level LIKE 'B%' OR level LIKE 'C%')
      ORDER BY random() * probability DESC
      LIMIT 1;
    END IF;

    -- Fallback: if no major prize available, pick any normal prize (excluding Last One)
    IF v_prize IS NULL THEN
      SELECT * INTO v_prize FROM product_prizes 
      WHERE product_id = p_product_id AND remaining > 0 AND level != 'Last One' AND level != 'LAST ONE'
      ORDER BY random() * probability DESC
      LIMIT 1;
    END IF;

    IF v_prize IS NULL THEN
      RAISE EXCEPTION 'No prizes left';
    END IF;

    -- Decrement quantity
    UPDATE product_prizes SET remaining = remaining - 1 WHERE id = v_prize.id;
    UPDATE products SET remaining = remaining - 1 WHERE id = p_product_id;

    -- Generate TXID data
    v_seed := md5(random()::text || clock_timestamp()::text);
    v_nonce := floor(random() * 1000000)::int;
    v_hash := md5(v_seed || v_nonce::text);
    v_random := random();

    -- Record in draw_records
    INSERT INTO draw_records (
        user_id, product_id, ticket_number, prize_level, prize_name,
        txid_seed, txid_nonce, txid_hash, random_value, profit_rate
    )
    VALUES (
        v_user_id, p_product_id, v_ticket_no, v_prize.level, v_prize.name,
        v_seed, v_nonce, v_hash, v_random, 1.0
    );

    -- Add to result
    v_prizes_drawn := v_prizes_drawn || jsonb_build_object(
      'grade', v_prize.level,
      'name', v_prize.name,
      'image_url', v_prize.image_url
    );

  END LOOP;

  RETURN v_prizes_drawn;
END;
$$;
