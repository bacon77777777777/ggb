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
  v_seed TEXT;
  v_nonce INTEGER;
  v_hash TEXT;
  v_random NUMERIC;
  v_product_remaining INTEGER;
  v_profit_rate NUMERIC;
  v_major_prizes TEXT[];
  v_major_total NUMERIC;
  v_minor_total NUMERIC;
  v_major_adjusted_total NUMERIC;
  v_minor_adjusted_total NUMERIC;
  v_minor_factor NUMERIC;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT price,
         remaining,
         seed,
         COALESCE(profit_rate, 1.0),
         major_prizes
  INTO v_product_price,
       v_product_remaining,
       v_seed,
       v_profit_rate,
       v_major_prizes
  FROM products
  WHERE id = p_product_id;

  IF v_product_price IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  IF v_major_prizes IS NULL OR array_length(v_major_prizes, 1) IS NULL OR array_length(v_major_prizes, 1) = 0 THEN
    v_major_prizes := ARRAY['A賞'];
  END IF;

  IF v_profit_rate IS NULL OR v_profit_rate <= 0 THEN
    v_profit_rate := 1.0;
  END IF;

  v_count := array_length(p_ticket_numbers, 1);
  IF v_count IS NULL OR v_count = 0 THEN
     RAISE EXCEPTION 'No tickets selected';
  END IF;

  v_total_cost := v_product_price * v_count;

  UPDATE users
  SET tokens = tokens - v_total_cost
  WHERE id = v_user_id
    AND tokens >= v_total_cost
  RETURNING tokens INTO v_user_tokens;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;
  
  FOREACH v_ticket_no IN ARRAY p_ticket_numbers LOOP
    IF EXISTS (SELECT 1 FROM draw_records WHERE product_id = p_product_id AND ticket_number = v_ticket_no) THEN
        RAISE EXCEPTION 'Ticket % is already sold', v_ticket_no;
    END IF;

    SELECT
      COALESCE(SUM(CASE WHEN level = ANY(v_major_prizes) AND level NOT IN ('Last One', 'LAST ONE', '最後賞') THEN probability END), 0),
      COALESCE(SUM(CASE WHEN NOT (level = ANY(v_major_prizes)) AND level NOT IN ('Last One', 'LAST ONE', '最後賞') THEN probability END), 0)
    INTO v_major_total, v_minor_total
    FROM product_prizes
    WHERE product_id = p_product_id
      AND remaining > 0;

    v_major_adjusted_total := v_major_total * v_profit_rate;
    v_minor_adjusted_total := GREATEST(0, 100 - v_major_adjusted_total);

    IF v_minor_total > 0 THEN
      v_minor_factor := v_minor_adjusted_total / v_minor_total;
    ELSE
      v_minor_factor := 1.0;
    END IF;

    SELECT *
    INTO v_prize
    FROM (
      SELECT
        pp.*,
        CASE
          WHEN pp.level = ANY(v_major_prizes)
               AND pp.level NOT IN ('Last One', 'LAST ONE', '最後賞')
            THEN pp.probability * v_profit_rate
          WHEN pp.level IN ('Last One', 'LAST ONE', '最後賞')
            THEN 0
          ELSE
            pp.probability * v_minor_factor
        END AS adjusted_weight
      FROM product_prizes pp
      WHERE pp.product_id = p_product_id
        AND pp.remaining > 0
        AND pp.level NOT IN ('Last One', 'LAST ONE', '最後賞')
    ) sub
    ORDER BY random() * adjusted_weight DESC
    LIMIT 1;

    IF v_prize IS NULL THEN
      RAISE EXCEPTION 'No prizes left';
    END IF;

    UPDATE product_prizes SET remaining = remaining - 1 WHERE id = v_prize.id;
    UPDATE products SET remaining = remaining - 1 WHERE id = p_product_id
    RETURNING remaining INTO v_product_remaining;

    v_nonce := v_ticket_no;
    v_hash := encode(digest(v_seed || ':' || v_nonce::text, 'sha256'), 'hex');
    v_random := random();

    INSERT INTO draw_records (
        user_id, product_id, ticket_number, prize_level, prize_name,
        txid_seed, txid_nonce, txid_hash, random_value, profit_rate,
        image_url, product_prize_id, status, is_last_one
    )
    VALUES (
        v_user_id, p_product_id, v_ticket_no, v_prize.level, v_prize.name,
        v_seed, v_nonce, v_hash, v_random, v_profit_rate,
        v_prize.image_url, v_prize.id, 'in_warehouse', FALSE
    );

    INSERT INTO notifications (
      user_id,
      type,
      title,
      body,
      link,
      meta
    )
    VALUES (
      v_user_id,
      'draw_result',
      '抽獎結果通知',
      format('你在商品 %s 中抽中了 %s %s 號碼 %s', p_product_id, v_prize.level, v_prize.name, v_ticket_no),
      format('/records?product_id=%s', p_product_id),
      jsonb_build_object(
        'product_id', p_product_id,
        'ticket_number', v_ticket_no,
        'prize_level', v_prize.level,
        'prize_name', v_prize.name
      )
    );

    v_prizes_drawn := v_prizes_drawn || jsonb_build_object(
      'grade', v_prize.level,
      'name', v_prize.name,
      'image_url', v_prize.image_url,
      'ticket_number', v_ticket_no,
      'is_last_one', false
    );

    IF v_product_remaining = 0 THEN
       SELECT * INTO v_last_one_prize FROM product_prizes 
       WHERE product_id = p_product_id 
         AND (level IN ('Last One', 'LAST ONE', '最後賞'))
       LIMIT 1;

       IF v_last_one_prize IS NOT NULL THEN
        UPDATE product_prizes SET remaining = 0 WHERE id = v_last_one_prize.id;

        v_nonce := 0;
        v_hash := encode(digest(v_seed || ':' || v_nonce::text, 'sha256'), 'hex');
        v_random := random();

        INSERT INTO draw_records (
           user_id, product_id, product_prize_id, ticket_number, prize_level, prize_name, status,
           txid_seed, txid_nonce, txid_hash, random_value, profit_rate, image_url, is_last_one
         ) VALUES (
           v_user_id, p_product_id, v_last_one_prize.id, 0, v_last_one_prize.level, v_last_one_prize.name, 'in_warehouse',
           v_seed, v_nonce, v_hash, v_random, v_profit_rate, v_last_one_prize.image_url, TRUE
         );

        INSERT INTO notifications (
          user_id,
          type,
          title,
          body,
          link,
          meta
        )
        VALUES (
          v_user_id,
          'draw_last_one',
          '最後賞獲得通知',
          format('你在商品 %s 中抽中了最後賞 %s', p_product_id, v_last_one_prize.name),
          format('/records?product_id=%s', p_product_id),
          jsonb_build_object(
            'product_id', p_product_id,
            'ticket_number', 0,
            'prize_level', v_last_one_prize.level,
            'prize_name', v_last_one_prize.name
          )
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

