-- 433: 封存商品的籤號範圍必須嚴格一致
--
-- 429 的查表寫成「查不到就走舊路徑」，這在只有一種商品形狀時看起來沒問題，
-- 但 products.total_count 只要比可排籤數大，多出來的籤就會安靜地用舊演算法出獎。
--
-- 而「大一張」正是設了最後賞的標準情形：
--   A賞 2 + B賞 18 + 最後賞 1 → total_count = 21，但封存表只排 20 張
--   （最後賞不是抽出來的，是給抽完最後一張的人）
-- 第 21 號籤因此不在封存表內 → 掉回舊路徑 → 不報錯、不可驗證。
-- 玩家去驗證頁會看到那張籤「表上沒有」，而平台這邊完全沒有任何徵兆。
--
-- 兩邊一起收：
--   1. 封存時把 total_count / remaining 校正成實際排出的籤數，
--      讓「可買的籤號」與「封存表的索引」永遠是同一組數字。
--      remaining 歸零的時機也因此才會剛好落在最後一張籤，最後賞才觸發得到。
--   2. play_ichiban 遇到超出範圍的籤直接擋，不再有靜默的舊路徑後門。

CREATE OR REPLACE FUNCTION public.play_ichiban(p_product_id bigint, p_ticket_numbers integer[], p_use_points boolean DEFAULT false, p_coupon_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_user_id              UUID;
  v_user_tokens          INTEGER;
  v_user_points          INTEGER;
  v_product_price        INTEGER;
  v_product_remaining    INTEGER;
  v_total_count          INTEGER;
  v_seed                 TEXT;
  v_profit_rate          NUMERIC;
  v_major_prizes         TEXT[];
  v_product_status       TEXT;
  v_product_type         TEXT;
  v_draw_key             TEXT;
  v_prize                RECORD;
  v_last_one_prize       RECORD;
  v_prizes_drawn         JSONB := '[]'::jsonb;
  v_ticket_no            INTEGER;
  v_nonce                INTEGER;
  v_hmac                 BYTEA;
  v_hex                  TEXT;
  v_random               NUMERIC;
  v_random_int           NUMERIC;
  v_hash                 TEXT;
  v_total_cost           INTEGER;
  v_total_cost_points    INTEGER;
  v_draw_count           INTEGER;
  v_coupon_record        RECORD;
  v_discount_amount      INTEGER := 0;
  v_prob_total           NUMERIC;
  v_major_total          NUMERIC;
  v_minor_total          NUMERIC;
  v_major_adjusted_total NUMERIC;
  v_minor_adjusted_total NUMERIC;
  v_minor_factor         NUMERIC;
  v_i                    INTEGER;
  v_seal_len             INTEGER;
  v_commitment           TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_ticket_numbers IS NULL OR array_length(p_ticket_numbers, 1) IS NULL OR array_length(p_ticket_numbers, 1) = 0 THEN
    RAISE EXCEPTION 'No tickets selected';
  END IF;

  v_draw_count := array_length(p_ticket_numbers, 1);

  SELECT price, remaining, total_count, seed,
         COALESCE(profit_rate, 1.0), major_prizes, status, type
  INTO   v_product_price, v_product_remaining, v_total_count,
         v_seed, v_profit_rate, v_major_prizes, v_product_status, v_product_type
  FROM   products
  WHERE  id = p_product_id;

  IF v_product_price IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  IF v_product_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Product not active';
  END IF;

  -- 類型防護：一番賞通道只能抽一番賞商品
  IF v_product_type NOT IN ('ichiban', 'card', 'custom') THEN
    RAISE EXCEPTION 'Wrong product type for this draw';
  END IF;

  IF COALESCE(v_product_remaining, 0) < v_draw_count THEN
    RAISE EXCEPTION 'Not enough stock remaining';
  END IF;

  -- 確認每個票號都未曾抽過
  IF EXISTS (
    SELECT 1 FROM draw_records
    WHERE product_id = p_product_id
      AND ticket_number = ANY(p_ticket_numbers)
  ) THEN
    RAISE EXCEPTION 'TICKET_ALREADY_DRAWN';
  END IF;

  -- 票號必須在合法範圍
  IF EXISTS (
    SELECT 1 FROM unnest(p_ticket_numbers) t(n)
    WHERE n < 1 OR n > v_total_count
  ) THEN
    RAISE EXCEPTION 'Invalid ticket number';
  END IF;

  IF v_seed IS NULL THEN
    v_seed := md5(random()::text || clock_timestamp()::text);
    UPDATE products SET seed = v_seed WHERE id = p_product_id;
  END IF;

  -- 實際決定獎項的金鑰＝公開 seed + 私密 secret（secret 完抽後才公開）
  v_draw_key := public.ensure_draw_secret(p_product_id);

  IF v_major_prizes IS NULL OR array_length(v_major_prizes, 1) IS NULL THEN
    v_major_prizes := ARRAY['A賞'];
  END IF;

  IF v_profit_rate IS NULL OR v_profit_rate <= 0 THEN
    v_profit_rate := 1.0;
  END IF;

  v_total_cost := v_product_price * v_draw_count;

  -- 優惠券
  IF p_coupon_id IS NOT NULL AND NOT p_use_points THEN
    SELECT uc.*, c.discount_type, c.discount_value, c.min_spend
    INTO   v_coupon_record
    FROM   user_coupons uc
    JOIN   coupons c ON uc.coupon_id = c.id
    WHERE  uc.id = p_coupon_id
      AND  uc.user_id = v_user_id
      AND  uc.status = 'unused'
      AND  c.is_active = TRUE
      AND  (uc.expiry_date IS NULL OR uc.expiry_date > now());

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

    UPDATE user_coupons SET status = 'used', used_at = now()
    WHERE id = p_coupon_id;
  END IF;

  v_total_cost := v_total_cost - v_discount_amount;

  -- 扣款
  IF p_use_points THEN
    v_total_cost_points := (v_product_price * v_draw_count) * 4;
    UPDATE users SET points = points - v_total_cost_points
    WHERE id = v_user_id AND points >= v_total_cost_points
    RETURNING points INTO v_user_points;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Insufficient points balance';
    END IF;
  ELSE
    UPDATE users SET tokens = tokens - v_total_cost
    WHERE id = v_user_id AND tokens >= v_total_cost
    RETURNING tokens INTO v_user_tokens;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Insufficient token balance';
    END IF;
  END IF;

  -- 封存資訊查一次就好，整個迴圈都是同一檔商品
  SELECT array_length(s.assignment, 1), s.commitment
  INTO   v_seal_len, v_commitment
  FROM   product_ticket_seals s WHERE s.product_id = p_product_id;

  -- 依票號逐一決定獎項
  FOR v_i IN 1..v_draw_count LOOP
    v_ticket_no := p_ticket_numbers[v_i];

    v_nonce := v_ticket_no;

    -- 有封存表 → 直接查表。獎項在開賣前就排定，抽獎當下不做任何機率運算，
    -- 這是「玩家可驗證」的前提：結果只跟籤號有關，跟誰先抽、抽了幾張都無關。
    IF v_seal_len IS NOT NULL THEN
      -- 封存過的商品，超出範圍的籤一律擋掉。
      -- 原本這裡是「查不到就走舊路徑」，結果 total_count 只要比封存籤數大一張
      -- （設了最後賞就會這樣），那張籤會安靜地用舊演算法出獎，不報錯也驗不了。
      IF v_ticket_no < 1 OR v_ticket_no > v_seal_len THEN
        RAISE EXCEPTION 'INVALID_TICKET: 籤號 % 不在封存範圍 1~% 內', v_ticket_no, v_seal_len;
      END IF;

      SELECT pp.id, pp.level, pp.name, pp.image_url
      INTO   v_prize
      FROM   product_ticket_seals s
      JOIN   product_prizes pp ON pp.id = s.assignment[v_ticket_no]
      WHERE  s.product_id = p_product_id;

      -- 憑證改記封存承諾：玩家拿它比對商品頁公布的值即可
      v_hash   := v_commitment;
      v_random := 0;

    ELSE
      -- 舊路徑：只給封存機制上線前就已開賣、無法回頭封存的商品用。
      -- 這些商品賣完就不會再有新的（新商品上架時一律自動封存），
      -- 不要為了「統一」把它刪掉，刪了在飛的檔期會直接壞掉。
      v_hmac       := hmac(convert_to(v_nonce::text, 'utf8'), convert_to(v_draw_key, 'utf8'), 'sha256'::text);
      v_hex        := encode(v_hmac, 'hex');
      v_random_int := hex_to_decimal(substring(v_hex, 1, 16));
      v_random     := v_random_int / 18446744073709551615.0;
      v_hash       := encode(digest(convert_to(v_seed || ':' || v_nonce::text, 'utf8'), 'sha256'::text), 'hex');


      SELECT COALESCE(SUM(CASE WHEN level NOT IN ('Last One', 'LAST ONE', '最後賞') THEN probability END), 0)
      INTO   v_prob_total
      FROM   product_prizes
      WHERE  product_id = p_product_id AND remaining > 0;

      IF v_prob_total <= 0 THEN
        WITH prize_weights AS (
          SELECT pp.id, pp.level, pp.name, pp.image_url,
                 CASE
                   WHEN pp.level = ANY(v_major_prizes) AND pp.level NOT IN ('Last One', 'LAST ONE', '最後賞')
                     THEN (pp.remaining::numeric) * v_profit_rate
                   WHEN pp.level IN ('Last One', 'LAST ONE', '最後賞')
                     THEN 0
                   ELSE (pp.remaining::numeric)
                 END AS adjusted_weight
          FROM   product_prizes pp
          WHERE  pp.product_id = p_product_id AND pp.remaining > 0
            AND  pp.level NOT IN ('Last One', 'LAST ONE', '最後賞')
        ),
        prize_cdf AS (
          SELECT *, SUM(adjusted_weight) OVER (ORDER BY level ASC, id ASC) AS cum_weight,
                    SUM(adjusted_weight) OVER () AS total_weight
          FROM prize_weights
        )
        SELECT * INTO v_prize FROM prize_cdf
        WHERE cum_weight >= (v_random * total_weight)
        ORDER BY cum_weight ASC LIMIT 1;
      ELSE
        SELECT COALESCE(SUM(CASE WHEN level = ANY(v_major_prizes) AND level NOT IN ('Last One', 'LAST ONE', '最後賞') THEN probability END), 0),
               COALESCE(SUM(CASE WHEN NOT (level = ANY(v_major_prizes)) AND level NOT IN ('Last One', 'LAST ONE', '最後賞') THEN probability END), 0)
        INTO   v_major_total, v_minor_total
        FROM   product_prizes
        WHERE  product_id = p_product_id AND remaining > 0;

        v_major_adjusted_total := v_major_total * v_profit_rate;
        v_minor_adjusted_total := GREATEST(0, 100 - v_major_adjusted_total);

        v_minor_factor := CASE WHEN v_minor_total > 0 THEN v_minor_adjusted_total / v_minor_total ELSE 1.0 END;

        WITH prize_weights AS (
          SELECT pp.id, pp.level, pp.name, pp.image_url,
                 CASE
                   WHEN pp.level = ANY(v_major_prizes) AND pp.level NOT IN ('Last One', 'LAST ONE', '最後賞')
                     THEN pp.probability * v_profit_rate
                   WHEN pp.level IN ('Last One', 'LAST ONE', '最後賞')
                     THEN 0
                   ELSE pp.probability * v_minor_factor
                 END AS adjusted_weight
          FROM   product_prizes pp
          WHERE  pp.product_id = p_product_id AND pp.remaining > 0
            AND  pp.level NOT IN ('Last One', 'LAST ONE', '最後賞')
        ),
        prize_cdf AS (
          SELECT *, SUM(adjusted_weight) OVER (ORDER BY level ASC, id ASC) AS cum_weight,
                    SUM(adjusted_weight) OVER () AS total_weight
          FROM prize_weights
        )
        SELECT * INTO v_prize FROM prize_cdf
        WHERE cum_weight >= (v_random * total_weight)
        ORDER BY cum_weight ASC LIMIT 1;
      END IF;
    END IF;

    IF v_prize IS NULL THEN
      RAISE EXCEPTION 'No prizes left';
    END IF;

    UPDATE product_prizes SET remaining = remaining - 1 WHERE id = v_prize.id;
    UPDATE products SET remaining = remaining - 1 WHERE id = p_product_id
    RETURNING remaining INTO v_product_remaining;

    INSERT INTO draw_records (
      user_id, product_id, ticket_number, prize_level, prize_name,
      txid_seed, txid_nonce, txid_hash, random_value, profit_rate,
      prize_image_url, product_prize_id, status, is_last_one, points_used
    ) VALUES (
      v_user_id, p_product_id, v_ticket_no, v_prize.level, v_prize.name,
      v_seed, v_nonce, v_hash, v_random, v_profit_rate,
      v_prize.image_url, v_prize.id, 'in_warehouse', FALSE,
      CASE WHEN p_use_points THEN v_product_price ELSE 0 END
    );

    v_prizes_drawn := v_prizes_drawn || jsonb_build_object(
      'grade', v_prize.level,
      'name', v_prize.name,
      'image_url', v_prize.image_url,
      'ticket_number', v_ticket_no,
      'is_last_one', false
    );
  END LOOP;

  -- 最後一抽觸發 Last One
  IF v_product_remaining = 0 THEN
    SELECT * INTO v_last_one_prize
    FROM   product_prizes
    WHERE  product_id = p_product_id
      AND  level IN ('Last One', 'LAST ONE', '最後賞', 'is_last_one')
       OR  (product_id = p_product_id AND is_last_one = TRUE)
    LIMIT 1;

    IF v_last_one_prize IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM draw_records WHERE product_id = p_product_id AND is_last_one = TRUE
    ) THEN
      UPDATE product_prizes SET remaining = 0 WHERE id = v_last_one_prize.id;

      DECLARE
        v_lo_seed  TEXT := md5(random()::text || clock_timestamp()::text);
        v_lo_nonce INTEGER := floor(random() * 1000000)::int;
      BEGIN
        INSERT INTO draw_records (
          user_id, product_id, product_prize_id, ticket_number, prize_level, prize_name, status,
          txid_seed, txid_nonce, txid_hash, random_value, profit_rate, prize_image_url, is_last_one, points_used
        ) VALUES (
          v_user_id, p_product_id, v_last_one_prize.id, 0,
          v_last_one_prize.level, v_last_one_prize.name, 'in_warehouse',
          v_lo_seed, v_lo_nonce, md5(v_lo_seed || v_lo_nonce::text), random(), 1.0,
          v_last_one_prize.image_url, TRUE,
          CASE WHEN p_use_points THEN v_product_price ELSE 0 END
        );

        v_prizes_drawn := v_prizes_drawn || jsonb_build_object(
          'grade', v_last_one_prize.level,
          'name', v_last_one_prize.name,
          'image_url', v_last_one_prize.image_url,
          'ticket_number', 0,
          'is_last_one', true
        );
      END;
    END IF;
  END IF;

  RETURN v_prizes_drawn;
END;
$function$

;

-- ── 封存時校正 total_count / remaining ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.seal_product_tickets(
  p_product_id BIGINT,
  p_seed       TEXT DEFAULT NULL,
  p_sealed_by  TEXT DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_seed        TEXT;
  v_salt        TEXT;
  v_rate        NUMERIC;
  v_total       INTEGER;
  v_drawn       INTEGER;
  v_major_ids   BIGINT[];
  v_minor_ids   BIGINT[];
  v_floor       INTEGER;
  v_assignment  BIGINT[];
  v_text        TEXT;
  v_commitment  TEXT;
BEGIN
  SELECT COUNT(*) INTO v_drawn FROM draw_records WHERE product_id = p_product_id;
  IF v_drawn > 0 THEN
    RAISE EXCEPTION 'ALREADY_SOLD: 已有 % 筆抽獎紀錄，封存後不可重排', v_drawn;
  END IF;

  SELECT COALESCE(profit_rate, 1.0) INTO v_rate FROM products WHERE id = p_product_id;
  IF v_rate IS NULL THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;

  v_seed := COALESCE(p_seed, encode(gen_random_bytes(32), 'hex'));
  v_salt := encode(gen_random_bytes(8), 'hex');

  WITH pool AS (
    SELECT pp.id, pp.total, SUM(pp.total) OVER () AS all_total
    FROM product_prizes pp
    WHERE pp.product_id = p_product_id
      AND pp.level NOT IN ('Last One', 'LAST ONE', '最後賞')
      AND pp.total > 0
  ),
  expanded AS (
    SELECT id, (total::numeric / all_total) <= 0.05 AS is_major
    FROM pool, generate_series(1, total)
  )
  SELECT array_agg(id) FILTER (WHERE is_major),
         array_agg(id) FILTER (WHERE NOT is_major)
  INTO v_major_ids, v_minor_ids
  FROM expanded;

  v_total := COALESCE(array_length(v_major_ids, 1), 0) + COALESCE(array_length(v_minor_ids, 1), 0);
  IF v_total = 0 THEN RAISE EXCEPTION 'NO_PRIZES'; END IF;

  v_floor := FLOOR(v_total * GREATEST(0, 100 - LEAST(v_rate * 100, 100)) / 100.0);

  PERFORM setseed(('x' || substr(md5(v_seed), 1, 8))::bit(32)::int / 2147483648.0);

  WITH minor_shuffled AS (
    SELECT id, row_number() OVER (ORDER BY random()) AS rn
    FROM unnest(COALESCE(v_minor_ids, '{}')) AS id
  ),
  major_slots AS (
    SELECT pos, row_number() OVER (ORDER BY random()) AS rn
    FROM generate_series(v_floor + 1, v_total) AS pos
  ),
  major_placed AS (
    SELECT m.id, s.pos
    FROM (SELECT id, row_number() OVER (ORDER BY random()) AS rn
          FROM unnest(COALESCE(v_major_ids, '{}')) AS id) m
    JOIN major_slots s USING (rn)
  ),
  free_slots AS (
    SELECT pos, row_number() OVER (ORDER BY pos) AS rn
    FROM generate_series(1, v_total) AS pos
    WHERE pos NOT IN (SELECT pos FROM major_placed)
  ),
  minor_placed AS (
    SELECT m.id, f.pos FROM minor_shuffled m JOIN free_slots f USING (rn)
  )
  SELECT array_agg(id ORDER BY pos)
  INTO v_assignment
  FROM (SELECT * FROM major_placed UNION ALL SELECT * FROM minor_placed) x;

  v_text       := public.build_seal_text(p_product_id, v_salt, v_assignment);
  v_commitment := encode(digest(convert_to(v_text, 'utf8'), 'sha256'), 'hex');

  INSERT INTO product_ticket_seals (product_id, salt, assignment, commitment, profit_rate, sealed_by)
  VALUES (p_product_id, v_salt, v_assignment, v_commitment, v_rate, p_sealed_by)
  ON CONFLICT (product_id) DO UPDATE
    SET salt = EXCLUDED.salt, assignment = EXCLUDED.assignment,
        commitment = EXCLUDED.commitment, profit_rate = EXCLUDED.profit_rate,
        sealed_at = now(), sealed_by = EXCLUDED.sealed_by;

  -- total_count 校正成實際排出的籤數。最後賞不是可買的籤，不能算進去 ——
  -- 算進去的話最後一張籤號會落在封存表外，而且 remaining 永遠歸不了零，
  -- 最後賞反而永遠不會觸發。此時尚無抽獎紀錄，remaining 等於 total_count。
  UPDATE products
     SET seed = v_seed, txid_hash = v_commitment, sealed_at = now(),
         total_count = v_total, remaining = v_total
   WHERE id = p_product_id;

  RETURN jsonb_build_object(
    'success', true, 'tickets', v_total, 'commitment', v_commitment,
    'major_count', COALESCE(array_length(v_major_ids, 1), 0), 'major_floor', v_floor
  );
END;
$$;
