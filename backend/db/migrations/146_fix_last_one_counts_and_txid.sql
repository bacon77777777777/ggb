CREATE OR REPLACE FUNCTION public.play_ichiban(
  p_product_id BIGINT, 
  p_ticket_numbers INTEGER[],
  p_use_points BOOLEAN DEFAULT FALSE,
  p_coupon_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_user_tokens INTEGER;
  v_user_points INTEGER;
  v_product_price INTEGER;
  v_total_cost INTEGER;
  v_total_cost_points INTEGER;
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
  v_normal_qty INTEGER;
  v_coupon_record RECORD;
  v_discount_amount INTEGER := 0;
  v_hmac BYTEA;
  v_hex TEXT;
  v_random_int NUMERIC;
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

  IF v_seed IS NULL THEN
    v_seed := md5(random()::text || clock_timestamp()::text);
    UPDATE products SET seed = v_seed WHERE id = p_product_id;
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

  SELECT COALESCE(SUM(remaining), 0) INTO v_normal_qty
  FROM product_prizes
  WHERE product_id = p_product_id
    AND level NOT IN ('Last One', 'LAST ONE', '最後賞');

  IF v_normal_qty IS NULL THEN
    v_normal_qty := 0;
  END IF;

  IF v_count > v_normal_qty THEN
    RAISE EXCEPTION 'Not enough tickets remaining';
  END IF;

  v_total_cost := v_product_price * v_count;

  IF p_coupon_id IS NOT NULL AND NOT p_use_points THEN
    SELECT uc.*, c.discount_type, c.discount_value, c.min_spend
    INTO v_coupon_record
    FROM user_coupons uc
    JOIN coupons c ON uc.coupon_id = c.id
    WHERE uc.id = p_coupon_id
      AND uc.user_id = v_user_id
      AND uc.status = 'unused'
      AND uc.expiry_date > now();
      
    IF v_coupon_record IS NULL THEN
      RAISE EXCEPTION 'Invalid or expired coupon';
    END IF;
    
    IF v_total_cost < v_coupon_record.min_spend THEN
      RAISE EXCEPTION 'Minimum spend not met for this coupon';
    END IF;
    
    IF v_coupon_record.discount_type = 'fixed' THEN
      v_discount_amount := v_coupon_record.discount_value;
    ELSIF v_coupon_record.discount_type = 'percentage' THEN
      v_discount_amount := floor(v_total_cost * (v_coupon_record.discount_value / 100.0));
    END IF;
    
    v_discount_amount := LEAST(v_discount_amount, v_total_cost);
    
    UPDATE user_coupons
    SET status = 'used',
        used_at = now()
    WHERE id = p_coupon_id;
  END IF;

  v_total_cost := v_total_cost - v_discount_amount;

  IF p_use_points THEN
    v_total_cost_points := (v_product_price * v_count) * 4;
    
    UPDATE users
    SET points = points - v_total_cost_points
    WHERE id = v_user_id
      AND points >= v_total_cost_points
    RETURNING points INTO v_user_points;
    
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Insufficient points balance';
    END IF;
  ELSE
    UPDATE users
    SET tokens = tokens - v_total_cost
    WHERE id = v_user_id
      AND tokens >= v_total_cost
    RETURNING tokens INTO v_user_tokens;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Insufficient token balance';
    END IF;
  END IF;
  
  FOREACH v_ticket_no IN ARRAY p_ticket_numbers LOOP
    IF EXISTS (SELECT 1 FROM draw_records WHERE product_id = p_product_id AND ticket_number = v_ticket_no) THEN
        RAISE EXCEPTION 'Ticket % is already sold', v_ticket_no;
    END IF;

    SELECT COALESCE(SUM(remaining), 0) INTO v_normal_qty
    FROM product_prizes
    WHERE product_id = p_product_id
      AND level NOT IN ('Last One', 'LAST ONE', '最後賞');

    IF v_normal_qty = 0 THEN
      SELECT * INTO v_last_one_prize FROM product_prizes 
      WHERE product_id = p_product_id
        AND (level IN ('Last One', 'LAST ONE', '最後賞'))
        AND remaining > 0
      LIMIT 1;

      IF v_last_one_prize IS NOT NULL THEN
        UPDATE product_prizes SET remaining = 0 WHERE id = v_last_one_prize.id;
        UPDATE products SET remaining = 0 WHERE id = p_product_id;

        v_nonce := 0;
        v_hmac := hmac(v_nonce::text, v_seed, 'sha256');
        v_hex := encode(v_hmac, 'hex');
        v_random_int := hex_to_decimal(substring(v_hex, 1, 16));
        v_random := v_random_int / 18446744073709551615.0;
        v_hash := encode(digest(v_seed || ':' || v_nonce::text, 'sha256'), 'hex');

        INSERT INTO draw_records (
          user_id, product_id, product_prize_id, ticket_number, prize_level, prize_name, status,
          txid_seed, txid_nonce, txid_hash, random_value, profit_rate, image_url, is_last_one
        ) VALUES (
          v_user_id, p_product_id, v_last_one_prize.id, 0, v_last_one_prize.level, v_last_one_prize.name, 'in_warehouse',
          v_seed, v_nonce, v_hash, v_random, 1.0, v_last_one_prize.image_url, TRUE
        );

        v_prizes_drawn := v_prizes_drawn || jsonb_build_object(
          'grade', v_last_one_prize.level,
          'name', v_last_one_prize.name,
          'image_url', v_last_one_prize.image_url,
          'ticket_number', 0,
          'is_last_one', true
        );
      END IF;

      EXIT;
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

    v_nonce := v_ticket_no;
    v_hmac := hmac(v_nonce::text, v_seed, 'sha256');
    v_hex := encode(v_hmac, 'hex');
    v_random_int := hex_to_decimal(substring(v_hex, 1, 16));
    v_random := v_random_int / 18446744073709551615.0;
    v_hash := encode(digest(v_seed || ':' || v_nonce::text, 'sha256'), 'hex');

    WITH prize_weights AS (
        SELECT
            pp.id,
            pp.level,
            pp.name,
            pp.image_url,
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
    ),
    prize_cdf AS (
        SELECT 
            *,
            SUM(adjusted_weight) OVER (ORDER BY level ASC, id ASC) as cum_weight,
            SUM(adjusted_weight) OVER () as total_weight
        FROM prize_weights
    )
    SELECT * INTO v_prize
    FROM prize_cdf
    WHERE cum_weight >= (v_random * total_weight)
    ORDER BY cum_weight ASC
    LIMIT 1;

    IF v_prize IS NULL THEN
      RAISE EXCEPTION 'No prizes left';
    END IF;

    UPDATE product_prizes SET remaining = remaining - 1 WHERE id = v_prize.id;
    UPDATE products SET remaining = GREATEST(remaining - 1, 0) WHERE id = p_product_id
    RETURNING remaining INTO v_product_remaining;

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

    IF v_prize.level = ANY(v_major_prizes) THEN
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
    END IF;

    v_prizes_drawn := v_prizes_drawn || jsonb_build_object(
      'grade', v_prize.level,
      'name', v_prize.name,
      'image_url', v_prize.image_url,
      'ticket_number', v_ticket_no,
      'is_last_one', false
    );
  END LOOP;

  RETURN v_prizes_drawn;
END;
$$;

UPDATE products
SET seed = md5(random()::text || clock_timestamp()::text)
WHERE seed IS NULL;

UPDATE product_prizes
SET probability = 0
WHERE level ILIKE '%last one%'
   OR level LIKE '%最後賞%';

WITH prize_sums AS (
  SELECT
    product_id,
    COALESCE(SUM(CASE WHEN level ILIKE '%last one%' OR level LIKE '%最後賞%' THEN 0 ELSE total END), 0) AS normal_total,
    COALESCE(SUM(CASE WHEN level ILIKE '%last one%' OR level LIKE '%最後賞%' THEN 0 ELSE remaining END), 0) AS normal_remaining
  FROM product_prizes
  GROUP BY product_id
)
UPDATE products p
SET total_count = s.normal_total,
    remaining = s.normal_remaining
FROM prize_sums s
WHERE p.id = s.product_id
  AND COALESCE(p.type, 'ichiban') = 'ichiban'
  AND (p.total_count IS NULL OR p.total_count <> s.normal_total OR p.remaining IS NULL OR p.remaining <> s.normal_remaining);

UPDATE draw_records dr
SET txid_seed = COALESCE(dr.txid_seed, p.seed),
    txid_nonce = COALESCE(dr.txid_nonce, dr.ticket_number),
    txid_hash = COALESCE(dr.txid_hash, encode(digest(p.seed || ':' || COALESCE(dr.txid_nonce, dr.ticket_number)::text, 'sha256'), 'hex')),
    random_value = COALESCE(dr.random_value, (hex_to_decimal(substring(encode(hmac(COALESCE(dr.txid_nonce, dr.ticket_number)::text, p.seed, 'sha256'), 'hex'), 1, 16)) / 18446744073709551615.0)),
    is_last_one = COALESCE(dr.is_last_one, FALSE) OR dr.ticket_number = 0 OR dr.prize_level ILIKE '%last one%' OR dr.prize_level LIKE '%最後賞%'
FROM products p
WHERE dr.product_id = p.id
  AND p.seed IS NOT NULL
  AND (dr.txid_hash IS NULL OR dr.txid_seed IS NULL OR dr.txid_nonce IS NULL OR dr.random_value IS NULL);
