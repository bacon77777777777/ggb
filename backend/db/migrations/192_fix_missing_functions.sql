-- 192_fix_missing_functions.sql
-- 修復三個遺失的 DB 函數：
--   1. daily_check_in        — 簽到失敗
--   2. get_check_in_status   — 簽到狀態無法讀取
--   3. process_test_topup    — 測試儲值失敗
--   4. dismantle_prizes      — 分解異常

BEGIN;

-- ── 1. 補 reward_amount 欄位（daily_check_ins 缺此欄） ─────────────────────
ALTER TABLE public.daily_check_ins
  ADD COLUMN IF NOT EXISTS reward_amount INTEGER NOT NULL DEFAULT 10;

-- ── 2. daily_check_in ─────────────────────────────────────────────────────
-- 獎勵階梯：Day1=10G, Day2=15G, ... Day7=40G，超過7天循環
CREATE OR REPLACE FUNCTION public.daily_check_in(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_today          DATE := CURRENT_DATE;
  v_consecutive    INTEGER := 0;
  v_check_date     DATE;
  v_cycle_day      INTEGER;
  v_reward         INTEGER;
BEGIN
  -- 今天已簽過？
  IF EXISTS (
    SELECT 1 FROM public.daily_check_ins
    WHERE user_id = p_user_id AND check_in_date = v_today
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', '今日已簽到');
  END IF;

  -- 計算連續天數（往前找連續的日期）
  v_check_date := v_today - 1;
  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.daily_check_ins
      WHERE user_id = p_user_id AND check_in_date = v_check_date
    );
    v_consecutive := v_consecutive + 1;
    v_check_date  := v_check_date - 1;
  END LOOP;

  -- 本次是第幾天（0-indexed cycle day）
  v_cycle_day := v_consecutive % 7;
  v_reward    := 10 + (v_cycle_day * 5);   -- 10, 15, 20, 25, 30, 35, 40

  -- 寫入簽到紀錄
  INSERT INTO public.daily_check_ins (user_id, check_in_date, reward_amount)
  VALUES (p_user_id, v_today, v_reward);

  -- 增加代幣
  UPDATE public.users
  SET tokens = COALESCE(tokens, 0) + v_reward
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', '簽到成功',
    'reward',  v_reward
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.daily_check_in(UUID) TO authenticated;

-- ── 3. get_check_in_status ────────────────────────────────────────────────
-- 前端期望欄位：consecutive_days, checked_in_today, next_reward
CREATE OR REPLACE FUNCTION public.get_check_in_status(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_today          DATE := CURRENT_DATE;
  v_consecutive    INTEGER := 0;
  v_check_date     DATE;
  v_checked_today  BOOLEAN;
  v_cycle_day      INTEGER;
  v_next_reward    INTEGER;
BEGIN
  -- 今天簽了嗎？
  SELECT EXISTS (
    SELECT 1 FROM public.daily_check_ins
    WHERE user_id = p_user_id AND check_in_date = v_today
  ) INTO v_checked_today;

  -- 往前數連續天數
  IF v_checked_today THEN
    v_consecutive := 1;
    v_check_date  := v_today - 1;
  ELSE
    v_check_date  := v_today - 1;
  END IF;

  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.daily_check_ins
      WHERE user_id = p_user_id AND check_in_date = v_check_date
    );
    v_consecutive := v_consecutive + 1;
    v_check_date  := v_check_date - 1;
  END LOOP;

  -- 下次獎勵（若今天還沒簽 = 本次；若今天已簽 = 明天）
  IF v_checked_today THEN
    v_cycle_day := v_consecutive % 7;       -- 明天的 cycle day
  ELSE
    v_cycle_day := v_consecutive % 7;       -- 今天的 cycle day
  END IF;
  v_next_reward := 10 + (v_cycle_day * 5);

  RETURN jsonb_build_object(
    'consecutive_days',  v_consecutive,
    'checked_in_today',  v_checked_today,
    'next_reward',       v_next_reward
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_check_in_status(UUID) TO authenticated, anon;

-- ── 4. process_test_topup ─────────────────────────────────────────────────
-- 使用 tokens（非 points），與正式 confirm_topup_order 行為一致
CREATE OR REPLACE FUNCTION public.process_test_topup(
  p_amount DECIMAL,
  p_bonus  DECIMAL
) RETURNS JSON AS $$
DECLARE
  v_user_id      UUID;
  v_order_number VARCHAR(50);
  v_total_tokens INTEGER;
  v_new_balance  INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_order_number := 'TEST' || to_char(now(), 'YYMMDD') || lpad(floor(random() * 10000)::text, 4, '0');
  v_total_tokens := p_amount::INTEGER + p_bonus::INTEGER;

  INSERT INTO public.recharge_records (
    order_number, user_id, amount, bonus, status, payment_method, updated_at
  ) VALUES (
    v_order_number, v_user_id, p_amount, p_bonus, 'success', 'other', NOW()
  );

  UPDATE public.users
  SET tokens = COALESCE(tokens, 0) + v_total_tokens
  WHERE id = v_user_id
  RETURNING tokens INTO v_new_balance;

  INSERT INTO public.notifications (user_id, type, title, body, link, meta)
  VALUES (
    v_user_id, 'topup', '測試儲值成功',
    format('儲值 %s 元，獲得 %s G（含贈送 %s）', p_amount, v_total_tokens, p_bonus),
    '/profile?tab=topup-history',
    jsonb_build_object(
      'order_number', v_order_number,
      'amount', p_amount,
      'bonus', p_bonus,
      'added_tokens', v_total_tokens,
      'new_balance', v_new_balance
    )
  );

  RETURN json_build_object(
    'success', true,
    'order_number', v_order_number,
    'added_tokens', v_total_tokens,
    'new_balance', v_new_balance
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.process_test_topup(DECIMAL, DECIMAL) TO authenticated;

-- ── 5. dismantle_prizes ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dismantle_prizes(
  p_record_ids BIGINT[],
  p_user_id    UUID
) RETURNS TABLE (success_count INTEGER, total_refund INTEGER) AS $$
DECLARE
  v_record      RECORD;
  v_refund      INTEGER := 0;
  v_count       INTEGER := 0;
  v_prize_value INTEGER;
BEGIN
  FOR v_record IN
    SELECT dr.id, dr.product_prize_id,
           pp.recycle_value, pp.total, p.price
    FROM   public.draw_records     dr
    JOIN   public.product_prizes   pp ON pp.id = dr.product_prize_id
    JOIN   public.products         p  ON p.id  = pp.product_id
    WHERE  dr.id        = ANY(p_record_ids)
      AND  dr.user_id   = p_user_id
      AND  dr.status    = 'in_warehouse'
  LOOP
    v_prize_value := COALESCE(v_record.recycle_value, 0);

    -- fallback：recycle_value 未設定時依稀有度估算
    IF v_prize_value = 0 THEN
      IF v_record.total > 0 AND v_record.total <= 4 THEN
        v_prize_value := FLOOR(v_record.price / 2);
      ELSE
        v_prize_value := 50;
      END IF;
    END IF;

    IF v_prize_value > 0 THEN
      UPDATE public.draw_records SET status = 'dismantled' WHERE id = v_record.id;

      -- 回收池（忽略已存在的重複）
      INSERT INTO public.admin_recycle_pool (product_prize_id, original_draw_record_id)
      VALUES (v_record.product_prize_id, v_record.id)
      ON CONFLICT DO NOTHING;

      v_refund := v_refund + v_prize_value;
      v_count  := v_count  + 1;
    END IF;
  END LOOP;

  IF v_refund > 0 THEN
    UPDATE public.users
    SET tokens = COALESCE(tokens, 0) + v_refund
    WHERE id = p_user_id;
  END IF;

  RETURN QUERY SELECT v_count, v_refund;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.dismantle_prizes(BIGINT[], UUID) TO authenticated;

COMMIT;
