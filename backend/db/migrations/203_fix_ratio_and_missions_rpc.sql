-- 203_fix_ratio_and_missions_rpc.sql
-- 1. 積分比例改回 4（4 積分 = 1 G幣）
-- 2. 建立缺失的 get_user_missions RPC

BEGIN;

-- ── 1. play_gacha 積分比例改回 4 ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.play_gacha(
  p_product_id  BIGINT,
  p_count       INTEGER DEFAULT 1,
  p_use_points  BOOLEAN DEFAULT FALSE,
  p_coupon_id   UUID    DEFAULT NULL
) RETURNS JSONB AS $$
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

  SELECT * INTO v_product FROM public.products WHERE id = p_product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
  IF v_product.status <> 'selling' THEN RAISE EXCEPTION 'Product is not available'; END IF;
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
      AND uc.is_used = FALSE
      AND c.is_active = TRUE
      AND (c.expires_at IS NULL OR c.expires_at > NOW());
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
      UPDATE public.user_coupons SET is_used = TRUE, used_at = NOW() WHERE id = p_coupon_id;
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.play_gacha(BIGINT, INTEGER, BOOLEAN, UUID) TO authenticated;

-- ── 2. get_user_missions RPC ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_user_missions()
RETURNS TABLE (
  id             UUID,
  type           TEXT,
  title          TEXT,
  description    TEXT,
  target_value   INTEGER,
  reward_coins   INTEGER,
  condition_type TEXT,
  icon_name      TEXT,
  progress       INTEGER,
  is_completed   BOOLEAN,
  is_claimed     BOOLEAN,
  period_key     TEXT
) AS $$
DECLARE
  v_user_id UUID;
  v_today   TEXT;
  v_week    TEXT;
BEGIN
  v_user_id := auth.uid();
  v_today   := to_char(NOW(), 'YYYY-MM-DD');
  v_week    := to_char(NOW(), 'IYYY-IW');

  RETURN QUERY
  SELECT
    t.id,
    t.type,
    t.title,
    t.description,
    t.target_value,
    t.reward_coins,
    t.condition_type,
    t.icon_name,
    COALESCE(utp.progress, 0)      AS progress,
    COALESCE(utp.is_completed, false) AS is_completed,
    COALESCE(utp.is_claimed, false)   AS is_claimed,
    COALESCE(utp.period_key,
      CASE
        WHEN t.type = 'daily'       THEN v_today
        WHEN t.type = 'weekly'      THEN v_week
        ELSE 'ALL'
      END
    ) AS period_key
  FROM public.tasks t
  LEFT JOIN public.user_task_progress utp
    ON utp.task_id = t.id
   AND utp.user_id = v_user_id
   AND (
         (t.type = 'daily'       AND utp.period_key = v_today) OR
         (t.type = 'weekly'      AND utp.period_key = v_week)  OR
         (t.type = 'achievement' AND utp.period_key = 'ALL')
       )
  WHERE t.is_active = TRUE
  ORDER BY
    CASE WHEN COALESCE(utp.is_claimed,   false) THEN 2 ELSE 0 END,
    CASE WHEN COALESCE(utp.is_completed, false) THEN 0 ELSE 1 END,
    t.type,
    t.reward_coins DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_user_missions() TO authenticated;

COMMIT;
