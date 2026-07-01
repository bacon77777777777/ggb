-- 202_points_system.sql
-- 建立積分系統：
-- 1. users 加 points 欄位
-- 2. daily_check_in 改給積分（不是 tokens），1-6 天 +20，第 7 天 +100
-- 3. play_gacha 積分比例 4 → 3（3 積分 = 1 G幣）
-- 4. 建立 claim_task_reward function
-- 5. 重置任務積分數量

BEGIN;

-- ── 1. users.points 欄位 ──────────────────────────────────────────────────────
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 0;

-- ── 2. daily_check_in → 給積分（1-6 天 +20，第 7 天 +100）────────────────────
CREATE OR REPLACE FUNCTION public.daily_check_in(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_today       DATE    := CURRENT_DATE;
  v_consecutive INTEGER := 0;
  v_check_date  DATE;
  v_cycle_day   INTEGER;
  v_reward      INTEGER;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.daily_check_ins
    WHERE user_id = p_user_id AND check_in_date = v_today
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', '今日已簽到');
  END IF;

  v_check_date := v_today - 1;
  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.daily_check_ins
      WHERE user_id = p_user_id AND check_in_date = v_check_date
    );
    v_consecutive := v_consecutive + 1;
    v_check_date  := v_check_date - 1;
  END LOOP;

  v_cycle_day := v_consecutive % 7;
  -- 第 7 天（cycle_day = 6）給 100 積分，其餘給 20
  v_reward := CASE WHEN v_cycle_day = 6 THEN 100 ELSE 20 END;

  INSERT INTO public.daily_check_ins (user_id, check_in_date, reward_amount)
  VALUES (p_user_id, v_today, v_reward);

  UPDATE public.users
  SET points = COALESCE(points, 0) + v_reward
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'success',          true,
    'message',          '簽到成功',
    'reward',           v_reward,
    'consecutive_days', v_consecutive + 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.daily_check_in(UUID) TO authenticated;

-- ── 3. play_gacha 積分比例 4 → 3 ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.play_gacha(
  p_product_id  BIGINT,
  p_count       INTEGER DEFAULT 1,
  p_use_points  BOOLEAN DEFAULT FALSE,
  p_coupon_id   UUID    DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_user_id          UUID;
  v_product          RECORD;
  v_product_price    INTEGER;
  v_total_cost       INTEGER;
  v_total_cost_points INTEGER;
  v_discount_amount  INTEGER := 0;
  v_coupon_record    RECORD;
  v_user_points      INTEGER;
  v_user_tokens      INTEGER;
  v_prize            RECORD;
  v_last_one_prize   RECORD;
  v_prizes_drawn     JSONB := '[]'::jsonb;
  v_random           NUMERIC;
  v_random_int       NUMERIC;
  v_cumulative       NUMERIC;
  v_selected_prize   RECORD;
  v_draw_record_id   BIGINT;
  i                  INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_product FROM public.products WHERE id = p_product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
  IF v_product.status <> 'selling' THEN RAISE EXCEPTION 'Product is not available'; END IF;
  IF v_product.remaining < p_count THEN RAISE EXCEPTION 'Not enough tickets remaining'; END IF;

  v_product_price := v_product.price;
  v_total_cost    := v_product_price * p_count;

  -- 折扣券（僅 token 付款可用）
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
    IF FOUND THEN
      IF v_total_cost >= v_coupon_record.min_spend THEN
        IF v_coupon_record.discount_type = 'percentage' THEN
          v_discount_amount := FLOOR(v_total_cost * (v_coupon_record.discount_value / 100.0));
        ELSE
          v_discount_amount := v_coupon_record.discount_value;
        END IF;
        v_discount_amount := LEAST(v_discount_amount, v_total_cost);
      END IF;
    END IF;
  END IF;

  v_total_cost := v_total_cost - v_discount_amount;

  -- 扣款
  IF p_use_points THEN
    v_total_cost_points := (v_product_price * p_count) * 3;  -- 3 積分 = 1 G幣
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
    -- 標記折扣券已使用
    IF p_coupon_id IS NOT NULL AND v_discount_amount > 0 THEN
      UPDATE public.user_coupons SET is_used = TRUE, used_at = NOW() WHERE id = p_coupon_id;
    END IF;
  END IF;

  -- 抽獎
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
    'success',        true,
    'prizes',         v_prizes_drawn,
    'new_balance',    CASE WHEN p_use_points THEN v_user_points ELSE v_user_tokens END,
    'discount_amount', v_discount_amount
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.play_gacha(BIGINT, INTEGER, BOOLEAN, UUID) TO authenticated;

-- ── 4. claim_task_reward（任務領獎 → 給積分）─────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_task_reward(
  p_task_id   UUID,
  p_period_key TEXT
) RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_task    RECORD;
  v_progress RECORD;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id AND is_active = TRUE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', 'Task not found'); END IF;

  SELECT * INTO v_progress
  FROM public.user_task_progress
  WHERE user_id = v_user_id AND task_id = p_task_id AND period_key = p_period_key;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Task not started');
  END IF;

  IF v_progress.is_claimed THEN
    RETURN jsonb_build_object('success', false, 'message', 'Already claimed');
  END IF;

  IF v_progress.progress < v_task.target_value THEN
    RETURN jsonb_build_object('success', false, 'message', 'Task not completed');
  END IF;

  UPDATE public.user_task_progress
  SET is_claimed = TRUE, last_updated = NOW()
  WHERE user_id = v_user_id AND task_id = p_task_id AND period_key = p_period_key;

  UPDATE public.users
  SET points = COALESCE(points, 0) + v_task.reward_coins
  WHERE id = v_user_id;

  RETURN jsonb_build_object('success', true, 'reward', v_task.reward_coins);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.claim_task_reward(UUID, TEXT) TO authenticated;

-- ── 5. 重置任務積分（精算後的數值）──────────────────────────────────────────
TRUNCATE public.tasks RESTART IDENTITY CASCADE;

-- 每日任務
INSERT INTO public.tasks (type, title, description, target_value, reward_coins, condition_type, icon_name, is_active) VALUES
  ('daily', '每日簽到',     '每天登入簽到一次',             1,   6, 'login',        'Log-in',   true),
  ('daily', '每日首抽',     '每日完成 1 次抽獎',            1,   9, 'draw_count',   'Ticket',   true),
  ('daily', '每日分享',     '分享吉吉比給朋友',             1,   6, 'share_app',    'Share',    true),
  ('daily', '手氣大爆發',   '每日累積完成 3 次抽獎',        3,  15, 'draw_count',   'Sparkles', true),
  ('daily', '每日儲值',     '每日完成一次代幣儲值',         1,  12, 'spend_amount', 'Wallet',   true);

-- 每週任務
INSERT INTO public.tasks (type, title, description, target_value, reward_coins, condition_type, icon_name, is_active) VALUES
  ('weekly', '社群推廣大使', '本週分享連結 3 次',            3,  12, 'share_app',   'Share',    true),
  ('weekly', '分享達人',     '本週分享連結 5 次',            5,  18, 'share_app',   'Heart',    true),
  ('weekly', '豪爽儲值',     '本週完成一次代幣儲值',         1,  24, 'spend_amount','Wallet',   true),
  ('weekly', '週間抽獎王',   '本週累積完成 10 次抽獎',      10,  45, 'draw_count',  'Layers',   true),
  ('weekly', '抽獎狂熱',     '本週累積完成 30 次抽獎',      30,  90, 'draw_count',  'Sparkles', true);

-- 成就（一次性）
INSERT INTO public.tasks (type, title, description, target_value, reward_coins, condition_type, icon_name, is_active) VALUES
  ('achievement', '新手上路',   '累積完成 5 次抽獎',      5,    15, 'draw_count',  'Trophy',   true),
  ('achievement', '第一次儲值', '完成人生第一次代幣儲值', 1,    30, 'spend_amount','Wallet',   true),
  ('achievement', '分享大使',   '累積分享連結 10 次',    10,    30, 'share_app',   'Heart',    true),
  ('achievement', '轉蛋愛好者', '累積完成 30 次抽獎',    30,    60, 'draw_count',  'Trophy',   true),
  ('achievement', '轉蛋達人',   '累積完成 100 次抽獎',  100,   150, 'draw_count',  'Sparkles', true),
  ('achievement', '轉蛋狂人',   '累積完成 500 次抽獎',  500,   300, 'draw_count',  'Sparkles', true);

COMMIT;
