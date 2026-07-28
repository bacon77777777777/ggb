-- Migration 351: play_slot_locked RPC
-- 挑戰機台抽選核心 — 保底 / RUSH 狀態機

CREATE OR REPLACE FUNCTION public.play_slot_locked(p_machine_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id           UUID;
  v_machine           RECORD;
  v_session           RECORD;
  v_pool_item         RECORD;
  v_prize             RECORD;
  v_draw_record_id    BIGINT;
  v_in_rush           BOOL := FALSE;
  v_rush_triggered    BOOL := FALSE;
  v_is_floor          BOOL := FALSE;
  v_new_tokens        INT;
  v_rush_hits_remaining INT;
  v_spins_since_rush  INT;
  v_state             TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lock machine
  SELECT * INTO v_machine
  FROM public.slot_machines
  WHERE id = p_machine_id AND is_active = TRUE
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Machine not found or inactive';
  END IF;

  -- Deduct tokens (atomic check + deduct)
  UPDATE public.users
  SET tokens = tokens - v_machine.price_per_spin
  WHERE id = v_user_id AND tokens >= v_machine.price_per_spin
  RETURNING tokens INTO v_new_tokens;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient token balance';
  END IF;

  -- Get or create session (UPSERT)
  INSERT INTO public.slot_sessions (user_id, machine_id)
  VALUES (v_user_id, p_machine_id)
  ON CONFLICT (user_id, machine_id) DO NOTHING;

  SELECT * INTO v_session
  FROM public.slot_sessions
  WHERE user_id = v_user_id AND machine_id = p_machine_id
  FOR UPDATE;

  -- ── State machine ──────────────────────────────────────
  v_in_rush := (v_session.state = 'rush' AND v_session.rush_hits_remaining > 0);

  IF NOT v_in_rush THEN
    -- 保底：連續未觸發 RUSH 達閾值 → 強制觸發
    IF v_session.spins_since_rush >= v_machine.floor_spin_count THEN
      v_in_rush       := TRUE;
      v_rush_triggered := TRUE;
      v_is_floor       := TRUE;
    -- 正常觸發機率
    ELSIF RANDOM() < v_machine.trigger_rate THEN
      v_in_rush        := TRUE;
      v_rush_triggered := TRUE;
    END IF;

    IF v_rush_triggered THEN
      v_rush_hits_remaining := v_machine.min_rush_hits;
    END IF;
  END IF;

  -- ── 抽選獎品 ──────────────────────────────────────────
  IF v_is_floor THEN
    -- 保底：強制給 is_floor 品項
    SELECT spi.*, pp.name AS prize_name, pp.level AS prize_level,
           pp.image_url AS prize_image_url, pp.product_id,
           pp.recycle_value, pp.decompose_type, pp.decompose_value
    INTO v_pool_item
    FROM public.slot_pool_items spi
    JOIN public.product_prizes pp ON pp.id = spi.product_prize_id
    WHERE spi.machine_id = p_machine_id AND spi.is_floor = TRUE
    LIMIT 1;
  ELSIF v_in_rush THEN
    -- RUSH 模式：排除 normal_only 和 is_floor，加權隨機
    SELECT spi.*, pp.name AS prize_name, pp.level AS prize_level,
           pp.image_url AS prize_image_url, pp.product_id,
           pp.recycle_value, pp.decompose_type, pp.decompose_value
    INTO v_pool_item
    FROM public.slot_pool_items spi
    JOIN public.product_prizes pp ON pp.id = spi.product_prize_id
    WHERE spi.machine_id = p_machine_id
      AND spi.is_floor   = FALSE
      AND spi.normal_only = FALSE
      AND (spi.remaining IS NULL OR spi.remaining > 0)
    ORDER BY RANDOM() * spi.weight DESC
    LIMIT 1;
  ELSE
    -- 正常模式：排除 rush_only 和 is_floor，加權隨機
    SELECT spi.*, pp.name AS prize_name, pp.level AS prize_level,
           pp.image_url AS prize_image_url, pp.product_id,
           pp.recycle_value, pp.decompose_type, pp.decompose_value
    INTO v_pool_item
    FROM public.slot_pool_items spi
    JOIN public.product_prizes pp ON pp.id = spi.product_prize_id
    WHERE spi.machine_id = p_machine_id
      AND spi.is_floor  = FALSE
      AND spi.rush_only = FALSE
      AND (spi.remaining IS NULL OR spi.remaining > 0)
    ORDER BY RANDOM() * spi.weight DESC
    LIMIT 1;
  END IF;

  IF v_pool_item IS NULL THEN
    RAISE EXCEPTION 'No prizes available in pool';
  END IF;

  -- Decrement pool item remaining (skip for NULL = infinite)
  IF v_pool_item.remaining IS NOT NULL THEN
    UPDATE public.slot_pool_items
    SET remaining = remaining - 1
    WHERE id = v_pool_item.id AND remaining > 0;
  END IF;

  -- Insert draw record (倉庫入庫)
  INSERT INTO public.draw_records (
    user_id, product_id, product_prize_id,
    prize_name, prize_level, prize_image_url,
    status
  ) VALUES (
    v_user_id,
    v_pool_item.product_id,
    v_pool_item.product_prize_id,
    v_pool_item.prize_name,
    v_pool_item.prize_level,
    v_pool_item.prize_image_url,
    'in_warehouse'
  )
  RETURNING id INTO v_draw_record_id;

  -- Update total_draws
  UPDATE public.users SET total_draws = COALESCE(total_draws, 0) + 1 WHERE id = v_user_id;

  -- ── 更新 session 狀態 ──────────────────────────────────
  IF v_in_rush THEN
    -- 計算本輪後剩餘 RUSH 次數
    v_rush_hits_remaining := COALESCE(
      NULLIF(v_rush_hits_remaining, 0),   -- 本次 rush_triggered 設的值
      v_session.rush_hits_remaining       -- 已在 rush 中的剩餘
    ) - 1;

    -- 如果 RUSH 次數耗盡，檢查是否延續
    IF v_rush_hits_remaining <= 0 THEN
      IF RANDOM() < v_machine.continue_rate THEN
        v_rush_hits_remaining := 1;  -- 延續一次
        v_state := 'rush';
      ELSE
        v_rush_hits_remaining := 0;
        v_state := 'normal';
      END IF;
    ELSE
      v_state := 'rush';
    END IF;

    v_spins_since_rush := 0;  -- RUSH 中重置保底計數
  ELSE
    -- 正常模式：保底計數 +1
    v_rush_hits_remaining := 0;
    v_spins_since_rush    := v_session.spins_since_rush + 1;
    v_state               := 'normal';
  END IF;

  UPDATE public.slot_sessions SET
    state               = v_state,
    rush_hits_remaining = v_rush_hits_remaining,
    spins_since_rush    = v_spins_since_rush,
    total_spins         = total_spins + 1,
    updated_at          = NOW()
  WHERE user_id = v_user_id AND machine_id = p_machine_id;

  -- ── 回傳結果 ───────────────────────────────────────────
  RETURN jsonb_build_object(
    'success',         TRUE,
    'new_balance',     v_new_tokens,
    'draw_record_id',  v_draw_record_id,
    'prize', jsonb_build_object(
      'pool_item_id',   v_pool_item.id,
      'prize_id',       v_pool_item.product_prize_id,
      'name',           v_pool_item.prize_name,
      'level',          v_pool_item.prize_level,
      'image_url',      v_pool_item.prize_image_url,
      'recycle_value',  v_pool_item.recycle_value
    ),
    'session', jsonb_build_object(
      'state',               v_state,
      'rush_hits_remaining', v_rush_hits_remaining,
      'spins_since_rush',    v_spins_since_rush,
      'total_spins',         v_session.total_spins + 1
    ),
    'rush_triggered', v_rush_triggered,
    'is_floor',       v_is_floor
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.play_slot_locked(BIGINT) TO authenticated;
