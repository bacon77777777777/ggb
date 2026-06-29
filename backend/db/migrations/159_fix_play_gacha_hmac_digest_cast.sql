BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.play_gacha(
  p_product_id BIGINT,
  p_count INTEGER,
  p_use_points BOOLEAN DEFAULT FALSE,
  p_coupon_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_next_ticket_no INTEGER;
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
  v_prob_total NUMERIC;
  v_i INTEGER;
  v_product_status TEXT;
  v_total_count INTEGER;

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

  IF p_count IS NULL OR p_count <= 0 THEN
    RAISE EXCEPTION 'Invalid draw count';
  END IF;

  SELECT
    price,
    remaining,
    total_count,
    seed,
    COALESCE(profit_rate, 1.0),
    major_prizes,
    status
  INTO
    v_product_price,
    v_product_remaining,
    v_total_count,
    v_seed,
    v_profit_rate,
    v_major_prizes,
    v_product_status
  FROM products
  WHERE id = p_product_id;

  IF v_product_price IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  IF v_product_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Product not active';
  END IF;

  IF v_product_remaining IS NULL THEN
    v_product_remaining := 0;
  END IF;

  IF v_product_remaining < p_count THEN
    RAISE EXCEPTION 'Not enough stock remaining';
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

  v_total_cost := v_product_price * p_count;

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
    v_total_cost_points := (v_product_price * p_count) * 4;
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

  SELECT COALESCE(MAX(ticket_number), 0) + 1
  INTO v_next_ticket_no
  FROM draw_records
  WHERE product_id = p_product_id
    AND ticket_number IS NOT NULL
    AND ticket_number > 0;

  v_i := 1;
  WHILE v_i <= p_count LOOP
    IF v_product_remaining <= 0 THEN
      RAISE EXCEPTION 'Not enough stock remaining';
    END IF;

    v_ticket_no := v_next_ticket_no;
    v_next_ticket_no := v_next_ticket_no + 1;

    SELECT COALESCE(SUM(CASE WHEN level NOT IN ('Last One', 'LAST ONE', '最後賞') THEN probability END), 0)
    INTO v_prob_total
    FROM product_prizes
    WHERE product_id = p_product_id
      AND remaining > 0;

    v_nonce := v_ticket_no;
    v_hmac := hmac(convert_to(v_nonce::text, 'utf8'), convert_to(v_seed, 'utf8'), 'sha256'::text);
    v_hex := encode(v_hmac, 'hex');
    v_random_int := hex_to_decimal(substring(v_hex, 1, 16));
    v_random := v_random_int / 18446744073709551615.0;
    v_hash := encode(digest(convert_to(v_seed || ':' || v_nonce::text, 'utf8'), 'sha256'::text), 'hex');

    IF v_prob_total <= 0 THEN
      WITH prize_weights AS (
        SELECT
          pp.id,
          pp.level,
          pp.name,
          pp.image_url,
          CASE
            WHEN pp.level = ANY(v_major_prizes)
                 AND pp.level NOT IN ('Last One', 'LAST ONE', '最後賞')
              THEN (pp.remaining::numeric) * v_profit_rate
            WHEN pp.level IN ('Last One', 'LAST ONE', '最後賞')
              THEN 0
            ELSE
              (pp.remaining::numeric)
          END AS adjusted_weight
        FROM product_prizes pp
        WHERE pp.product_id = p_product_id
          AND pp.remaining > 0
          AND pp.level NOT IN ('Last One', 'LAST ONE', '最後賞')
      ),
      prize_cdf AS (
        SELECT
          *,
          SUM(adjusted_weight) OVER (ORDER BY level ASC, id ASC) AS cum_weight,
          SUM(adjusted_weight) OVER () AS total_weight
        FROM prize_weights
      )
      SELECT * INTO v_prize
      FROM prize_cdf
      WHERE cum_weight >= (v_random * total_weight)
      ORDER BY cum_weight ASC
      LIMIT 1;
    ELSE
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
          SUM(adjusted_weight) OVER (ORDER BY level ASC, id ASC) AS cum_weight,
          SUM(adjusted_weight) OVER () AS total_weight
        FROM prize_weights
      )
      SELECT * INTO v_prize
      FROM prize_cdf
      WHERE cum_weight >= (v_random * total_weight)
      ORDER BY cum_weight ASC
      LIMIT 1;
    END IF;

    IF v_prize IS NULL THEN
      RAISE EXCEPTION 'No prizes left';
    END IF;

    UPDATE product_prizes
    SET remaining = remaining - 1
    WHERE id = v_prize.id;

    UPDATE products
    SET remaining = remaining - 1
    WHERE id = p_product_id
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

    v_prizes_drawn := v_prizes_drawn || jsonb_build_object(
      'grade', v_prize.level,
      'name', v_prize.name,
      'image_url', v_prize.image_url,
      'ticket_number', v_ticket_no,
      'is_last_one', false
    );

    v_i := v_i + 1;
  END LOOP;

  IF v_product_remaining = 0 THEN
    SELECT * INTO v_last_one_prize
    FROM product_prizes
    WHERE product_id = p_product_id
      AND (level IN ('Last One', 'LAST ONE', '最後賞'))
    LIMIT 1;

    IF v_last_one_prize IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM draw_records WHERE product_id = p_product_id AND ticket_number = 0
      ) THEN
        UPDATE product_prizes SET remaining = 0 WHERE id = v_last_one_prize.id;

        v_seed := md5(random()::text || clock_timestamp()::text);
        v_nonce := floor(random() * 1000000)::int;
        v_hash := md5(v_seed || v_nonce::text);
        v_random := random();

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
    END IF;
  END IF;

  RETURN v_prizes_drawn;
END;
$$;

COMMIT;

