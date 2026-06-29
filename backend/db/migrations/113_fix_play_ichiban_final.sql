-- Fix play_ichiban function to cast UUID to TEXT for users table id comparison
-- This addresses the "operator does not exist: text = uuid" error and ensures correct column usage

CREATE OR REPLACE FUNCTION public.play_ichiban(p_product_id BIGINT, p_ticket_numbers INTEGER[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_user_tokens INTEGER;
  v_product_price INTEGER;
  v_total_cost INTEGER;
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
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT price INTO v_product_price FROM products WHERE id = p_product_id;
  IF v_product_price IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  v_count := array_length(p_ticket_numbers, 1);
  IF v_count IS NULL OR v_count = 0 THEN
     RAISE EXCEPTION 'No tickets selected';
  END IF;

  v_total_cost := v_product_price * v_count;

  -- Check user balance (Only from users table)
  -- Cast v_user_id to text if users.id is text
  SELECT tokens INTO v_user_tokens FROM users WHERE id = v_user_id::text;
  
  IF v_user_tokens IS NULL THEN
     RAISE EXCEPTION 'User not found or no tokens';
  END IF;

  IF v_user_tokens < v_total_cost THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  -- Deduct balance
  UPDATE users SET tokens = tokens - v_total_cost WHERE id = v_user_id::text;
  
  FOREACH v_ticket_no IN ARRAY p_ticket_numbers LOOP
    -- Check if ticket is already taken
    IF EXISTS (SELECT 1 FROM draw_records WHERE product_id = p_product_id AND ticket_number = v_ticket_no) THEN
        RAISE EXCEPTION 'Ticket % is already sold', v_ticket_no;
    END IF;

    -- Pick a random prize (EXCLUDING Last One)
    SELECT * INTO v_prize FROM product_prizes 
    WHERE product_id = p_product_id AND remaining > 0 AND level != 'Last One' AND level != 'LAST ONE' AND NOT level LIKE '%最後賞%'
    ORDER BY random() * probability DESC
    LIMIT 1;

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
    -- Ensure columns exist. Based on 109_fix_play_ichiban_uuid_cast.sql
    INSERT INTO draw_records (
        user_id, product_id, ticket_number, prize_level, prize_name,
        txid_seed, txid_nonce, txid_hash, random_value, profit_rate,
        image_url, product_prize_id, status
    )
    VALUES (
        v_user_id, p_product_id, v_ticket_no, v_prize.level, v_prize.name,
        v_seed, v_nonce, v_hash, v_random, 1.0,
        v_prize.image_url, v_prize.id, 'in_warehouse'
    );

    -- Add to result
    v_prizes_drawn := v_prizes_drawn || jsonb_build_object(
      'grade', v_prize.level,
      'name', v_prize.name,
      'image_url', v_prize.image_url,
      'ticket_number', v_ticket_no
    );

    -- Check if this was the last normal prize
    SELECT COALESCE(SUM(remaining), 0) INTO v_normal_qty FROM product_prizes 
    WHERE product_id = p_product_id AND level != 'Last One' AND level != 'LAST ONE' AND NOT level LIKE '%最後賞%';
    
    -- If no normal prizes left, award Last One
    IF v_normal_qty = 0 THEN
        SELECT * INTO v_last_one_prize FROM product_prizes 
        WHERE product_id = p_product_id AND (level = 'Last One' OR level = 'LAST ONE' OR level LIKE '%最後賞%') AND remaining > 0
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
                txid_seed, txid_nonce, txid_hash, random_value, profit_rate,
                image_url, product_prize_id, status
            )
            VALUES (
                v_user_id, p_product_id, 0, v_last_one_prize.level, v_last_one_prize.name,
                v_seed, v_nonce, v_hash, v_random, 1.0,
                v_last_one_prize.image_url, v_last_one_prize.id, 'in_warehouse'
            );

            v_prizes_drawn := v_prizes_drawn || jsonb_build_object(
              'grade', v_last_one_prize.level,
              'name', v_last_one_prize.name,
              'image_url', v_last_one_prize.image_url,
              'is_last_one', true,
              'ticket_number', 0
            );
        END IF;
    END IF;

  END LOOP;

  RETURN v_prizes_drawn;
END;
$$;
