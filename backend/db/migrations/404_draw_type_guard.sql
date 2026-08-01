-- 404: 抽獎通道類型防護（修跨類型抽獎）
--
-- 問題：play_gacha 不檢查商品類型，任何 active 商品都能用轉蛋通道抽。
--   1. 一番賞被用轉蛋通道抽 → 繞過 profit_rate 毛利控制、繞過 Last One 判定、
--      不寫 provably-fair 欄位（txid_seed/hash 皆 NULL），且會占用真實票號
--      （draw_records.ticket_number），害正常玩家該票號變成「已抽過」。
--   2. 老虎機獎池商品 price=0：目前 status='pending' 尚安全，但只要有人在
--      商品管理把它切上架，就會變成 0 元免費抽走實體卡牌的水龍頭。
-- 反向亦然：轉蛋商品可被 play_ichiban 抽（total_count 有值故票號驗證會過）。
--
-- 修法：兩條通道各自加類型白名單。
--   play_gacha   → 僅 gacha / blindbox / card / custom
--   play_ichiban → 僅 ichiban

CREATE OR REPLACE FUNCTION public.play_gacha(p_product_id bigint, p_count integer DEFAULT 1, p_use_points boolean DEFAULT false, p_coupon_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
 DECLARE
   v_user_id           UUID;
   v_product           RECORD;
   v_product_price     INTEGER;
   v_total_cost        INTEGER;
   v_total_cost_points INTEGER;
   v_discount_amount   INTEGER := 0;
   v_coupon_record     RECORD;
   v_user_points       INTEGER;
   v_user_tokens       INTEGER;
   v_prize             RECORD;
   v_last_one_prize    RECORD;
   v_prizes_drawn      JSONB := '[]'::jsonb;
   v_random            NUMERIC;
   v_random_int        NUMERIC;
   v_cumulative        NUMERIC;
   v_selected_prize    RECORD;
   v_draw_record_id    BIGINT;
   i                   INTEGER;
 BEGIN
   v_user_id := auth.uid();
   IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

   -- 次數下限/上限防護：擋負數印幣與異常大量
   IF p_count IS NULL OR p_count < 1 THEN RAISE EXCEPTION 'Invalid draw count'; END IF;
   IF p_count > 1000 THEN RAISE EXCEPTION 'Draw count too large'; END IF;

   SELECT * INTO v_product FROM public.products WHERE id = p_product_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
   IF v_product.status <> 'active' THEN RAISE EXCEPTION 'Product is not available'; END IF;

   -- 類型防護：此通道僅限轉蛋/盒玩/抽卡/自製賞；
   -- 一番賞須走 play_ichiban（票號+機率保證），老虎機獎池（price=0）絕不可由此抽
   IF COALESCE(v_product.type, '') NOT IN ('gacha', 'blindbox', 'card', 'custom') THEN
     RAISE EXCEPTION 'Wrong product type for this draw';
   END IF;
   IF v_product.remaining < p_count THEN RAISE EXCEPTION 'Not enough tickets remaining'; END IF;

   v_product_price := v_product.price;
   v_total_cost    := v_product_price * p_count;

   IF p_coupon_id IS NOT NULL AND NOT p_use_points THEN
     SELECT uc.*, c.discount_type, c.discount_value, c.min_spend
     INTO v_coupon_record
     FROM public.user_coupons uc
     JOIN public.coupons c ON c.id = uc.coupon_id
     WHERE uc.id = p_coupon_id
       AND uc.user_id = v_user_id
       AND uc.status = 'unused'
       AND c.is_active = TRUE
       AND (uc.expiry_date IS NULL OR uc.expiry_date > NOW());
     IF FOUND AND v_total_cost >= v_coupon_record.min_spend THEN
       IF v_coupon_record.discount_type = 'percentage' THEN
         v_discount_amount := FLOOR(v_total_cost * (v_coupon_record.discount_value / 100.0));
       ELSE
         v_discount_amount := v_coupon_record.discount_value;
       END IF;
       v_discount_amount := LEAST(v_discount_amount, v_total_cost);
     END IF;
   END IF;

   v_total_cost := v_total_cost - v_discount_amount;

   IF p_use_points THEN
     v_total_cost_points := (v_product_price * p_count) * 4;  -- 4 積分 = 1 G幣
     UPDATE public.users
     SET points = points - v_total_cost_points
     WHERE id = v_user_id AND points >= v_total_cost_points
     RETURNING points INTO v_user_points;
     IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient points balance'; END IF;
   ELSE
     UPDATE public.users
     SET tokens = tokens - v_total_cost
     WHERE id = v_user_id AND tokens >= v_total_cost
     RETURNING tokens INTO v_user_tokens;
     IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient token balance'; END IF;
     IF p_coupon_id IS NOT NULL AND v_discount_amount > 0 THEN
       UPDATE public.user_coupons SET status = 'used', used_at = NOW() WHERE id = p_coupon_id;
     END IF;
   END IF;

   FOR i IN 1..p_count LOOP
     SELECT * INTO v_last_one_prize
     FROM public.product_prizes
     WHERE product_id = p_product_id
       AND level IN ('Last One', 'LAST ONE', 'last one')
       AND remaining = 1
     LIMIT 1;

     IF FOUND AND v_product.remaining = 1 THEN
       v_selected_prize := v_last_one_prize;
     ELSE
       SELECT (random() * 18446744073709551615)::NUMERIC INTO v_random_int;
       v_random     := v_random_int / 18446744073709551615.0;
       v_cumulative := 0;
       v_selected_prize := NULL;
       FOR v_prize IN
         SELECT * FROM public.product_prizes
         WHERE product_id = p_product_id AND remaining > 0
           AND level NOT IN ('Last One', 'LAST ONE', 'last one')
         ORDER BY probability DESC
       LOOP
         v_cumulative := v_cumulative + (v_prize.probability / 100.0);
         IF v_random <= v_cumulative THEN
           v_selected_prize := v_prize;
           EXIT;
         END IF;
       END LOOP;
       IF v_selected_prize IS NULL THEN
         SELECT * INTO v_selected_prize
         FROM public.product_prizes
         WHERE product_id = p_product_id AND remaining > 0
           AND level NOT IN ('Last One', 'LAST ONE', 'last one')
         ORDER BY probability DESC LIMIT 1;
       END IF;
     END IF;

     IF v_selected_prize IS NULL THEN RAISE EXCEPTION 'No prizes available'; END IF;

     UPDATE public.product_prizes SET remaining = remaining - 1 WHERE id = v_selected_prize.id;
     UPDATE public.products SET remaining = remaining - 1 WHERE id = p_product_id;

     INSERT INTO public.draw_records (user_id, product_id, product_prize_id, status, ticket_number)
     VALUES (v_user_id, p_product_id, v_selected_prize.id, 'in_warehouse', v_product.remaining - (i - 1))
     RETURNING id INTO v_draw_record_id;

     UPDATE public.users SET total_draws = COALESCE(total_draws, 0) + 1 WHERE id = v_user_id;

     v_prizes_drawn := v_prizes_drawn || jsonb_build_object(
       'prize_id',    v_selected_prize.id,
       'level',       v_selected_prize.level,
       'name',        v_selected_prize.name,
       'image_url',   v_selected_prize.image_url,
       'record_id',   v_draw_record_id
     );
   END LOOP;

   RETURN jsonb_build_object(
     'success',         true,
     'prizes',          v_prizes_drawn,
     'new_balance',     CASE WHEN p_use_points THEN v_user_points ELSE v_user_tokens END,
     'discount_amount', v_discount_amount
   );
 END;
 $function$;;

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
  IF v_product_type IS DISTINCT FROM 'ichiban' THEN
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

  -- 依票號逐一決定獎項
  FOR v_i IN 1..v_draw_count LOOP
    v_ticket_no := p_ticket_numbers[v_i];

    v_nonce      := v_ticket_no;
    v_hmac       := hmac(convert_to(v_nonce::text, 'utf8'), convert_to(v_seed, 'utf8'), 'sha256'::text);
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
$function$;
