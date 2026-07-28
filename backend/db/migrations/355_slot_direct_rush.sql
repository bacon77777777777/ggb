-- migration 355: 直撃（直接進入 RUSH）+ 必得實物模式欄位

-- 必得實物模式：每次必得一件實物獎品
ALTER TABLE public.slot_machines
  ADD COLUMN IF NOT EXISTS guaranteed_prize boolean NOT NULL DEFAULT true;

-- enter_slot_rush_direct: 玩家付費直接進入 RUSH，費用 = 剩餘保底轉數 × 當前檔次
CREATE OR REPLACE FUNCTION public.enter_slot_rush_direct(
  p_machine_id BIGINT,
  p_bet        BIGINT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id    UUID;
  v_machine    RECORD;
  v_session    RECORD;
  v_new_tokens BIGINT;
  v_cost       BIGINT;
  v_remaining  INT;
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

  -- 驗證 bet 是合法 tier
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_machine.bet_tiers) t
    WHERE (t->>'coins')::bigint = p_bet
  ) THEN
    RAISE EXCEPTION 'Invalid bet tier: %', p_bet;
  END IF;

  -- Get or create session
  INSERT INTO public.slot_sessions (user_id, machine_id)
  VALUES (v_user_id, p_machine_id)
  ON CONFLICT (user_id, machine_id) DO NOTHING;

  SELECT * INTO v_session
  FROM public.slot_sessions
  WHERE user_id = v_user_id AND machine_id = p_machine_id
  FOR UPDATE;

  -- 已在 RUSH 中不允許再直撃
  IF v_session.state = 'rush' AND v_session.rush_hits_remaining > 0 THEN
    RAISE EXCEPTION '已在 RUSH 模式中，無法再次直撃';
  END IF;

  -- 費用 = max(min_rush_hits, floor_spin_count - spins_since_rush) × bet
  v_remaining := GREATEST(
    v_machine.min_rush_hits,
    v_machine.floor_spin_count - COALESCE(v_session.spins_since_rush, 0)
  );
  v_cost := v_remaining * p_bet;

  -- 扣款
  UPDATE public.users
  SET tokens = tokens - v_cost
  WHERE id = v_user_id AND tokens >= v_cost
  RETURNING tokens INTO v_new_tokens;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'G幣不足，直撃需要 %G', v_cost;
  END IF;

  -- 稽核軌跡
  INSERT INTO public.token_adjustments (user_id, delta, reason, created_by)
  VALUES (
    v_user_id,
    -v_cost,
    FORMAT('直撃進入 RUSH：機台 #%s，%sG × %s次', p_machine_id, p_bet, v_remaining),
    'system_direct_rush'
  );

  -- 設定 session 為 RUSH 狀態
  UPDATE public.slot_sessions
  SET
    state               = 'rush',
    rush_hits_remaining = v_machine.min_rush_hits,
    locked_bet          = p_bet,
    spins_since_rush    = 0,
    updated_at          = NOW()
  WHERE user_id = v_user_id AND machine_id = p_machine_id;

  RETURN jsonb_build_object(
    'success',     TRUE,
    'new_balance', v_new_tokens,
    'cost',        v_cost,
    'session', jsonb_build_object(
      'state',               'rush',
      'rush_hits_remaining', v_machine.min_rush_hits,
      'spins_since_rush',    0,
      'total_spins',         COALESCE(v_session.total_spins, 0),
      'locked_bet',          p_bet
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.enter_slot_rush_direct TO authenticated;
