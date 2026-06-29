ALTER TABLE draw_records 
  ADD COLUMN IF NOT EXISTS is_last_one BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS image_url TEXT;

ALTER TABLE product_prizes 
  ADD COLUMN IF NOT EXISTS is_last_one BOOLEAN;

UPDATE product_prizes
SET is_last_one = (level ILIKE 'last one' OR level LIKE '%最後賞%')
WHERE is_last_one IS DISTINCT FROM (level ILIKE 'last one' OR level LIKE '%最後賞%');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'uniq_last_one_per_product'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX uniq_last_one_per_product ON product_prizes(product_id) WHERE is_last_one IS TRUE';
  END IF;
END $$;

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
  v_seed TEXT;
  v_nonce INTEGER;
  v_hash TEXT;
  v_random NUMERIC;
  v_product_remaining INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT price, remaining, seed
  INTO v_product_price, v_product_remaining, v_seed
  FROM products WHERE id = p_product_id;

  IF v_product_price IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  v_total_cost := v_product_price * GREATEST(array_length(p_ticket_numbers, 1), 1);

  IF p_ticket_numbers IS NULL OR array_length(p_ticket_numbers, 1) = 0 THEN
    RAISE EXCEPTION 'No tickets selected';
  END IF;

  SELECT tokens INTO v_user_tokens FROM users WHERE id = v_user_id;
  IF v_user_tokens IS NULL OR v_user_tokens < v_total_cost THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  UPDATE users SET tokens = tokens - v_total_cost WHERE id = v_user_id;

  FOREACH v_ticket_no IN ARRAY p_ticket_numbers LOOP
    IF EXISTS (SELECT 1 FROM draw_records WHERE product_id = p_product_id AND ticket_number = v_ticket_no) THEN
      RAISE EXCEPTION 'Ticket % is already sold', v_ticket_no;
    END IF;

    SELECT * INTO v_prize
    FROM product_prizes
    WHERE product_id = p_product_id
      AND remaining > 0
      AND (level NOT IN ('Last One', 'LAST ONE', '最後賞'))
    ORDER BY random() * COALESCE(probability, 1) DESC
    LIMIT 1;

    IF v_prize IS NULL THEN
      RAISE EXCEPTION 'No prizes left';
    END IF;

    UPDATE product_prizes SET remaining = remaining - 1 WHERE id = v_prize.id;
    UPDATE products SET remaining = GREATEST(remaining - 1, 0) WHERE id = p_product_id
    RETURNING remaining INTO v_product_remaining;

    v_nonce := v_ticket_no;
    v_hash := encode(digest(v_seed || ':' || v_nonce::text, 'sha256'), 'hex');
    v_random := random();

    INSERT INTO draw_records (
      user_id, product_id, product_prize_id, ticket_number, prize_level, prize_name,
      txid_seed, txid_nonce, txid_hash, random_value, profit_rate,
      image_url, status, is_last_one
    )
    VALUES (
      v_user_id, p_product_id, v_prize.id, v_ticket_no, v_prize.level, v_prize.name,
      v_seed, v_nonce, v_hash, v_random, 1.0,
      v_prize.image_url, 'in_warehouse', FALSE
    );

    v_prizes_drawn := v_prizes_drawn || jsonb_build_object(
      'grade', v_prize.level,
      'name', v_prize.name,
      'image_url', v_prize.image_url,
      'ticket_number', v_ticket_no,
      'is_last_one', false
    );

    IF v_product_remaining = 0 THEN
      SELECT * INTO v_last_one_prize
      FROM product_prizes
      WHERE product_id = p_product_id
        AND (level IN ('Last One', 'LAST ONE', '最後賞'))
      LIMIT 1;

      IF v_last_one_prize IS NOT NULL THEN
        UPDATE product_prizes SET remaining = 0 WHERE id = v_last_one_prize.id;

        v_nonce := 0;
        v_hash := encode(digest(v_seed || ':' || v_nonce::text, 'sha256'), 'hex');
        v_random := random();

        INSERT INTO draw_records (
          user_id, product_id, product_prize_id, ticket_number, prize_level, prize_name,
          txid_seed, txid_nonce, txid_hash, random_value, profit_rate,
          image_url, status, is_last_one
        )
        VALUES (
          v_user_id, p_product_id, v_last_one_prize.id, 0, v_last_one_prize.level, v_last_one_prize.name,
          v_seed, v_nonce, v_hash, v_random, 1.0,
          v_last_one_prize.image_url, 'in_warehouse', TRUE
        );

        v_prizes_drawn := v_prizes_drawn || jsonb_build_object(
          'grade', v_last_one_prize.level,
          'name', v_last_one_prize.name,
          'image_url', v_last_one_prize.image_url,
          'ticket_number', 0,
          'is_last_one', true
        );
      END IF;
    END IF;
  END LOOP;

  RETURN v_prizes_drawn;
END;
$$;
