-- 401: 直擊金額改「剩餘保底轉數 × 檔次金額」（隨已轉數下降）

CREATE OR REPLACE FUNCTION public.enter_slot_rush_direct(p_machine_id bigint, p_bet bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user_id    UUID;
  v_machine    RECORD;
  v_session    RECORD;
  v_new_tokens BIGINT;
  v_cost       BIGINT;
  v_today      DATE;
  v_day_spins  INTEGER;
  v_day_rush   INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_machine
  FROM public.slot_machines
  WHERE id = p_machine_id AND is_active = TRUE
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Machine not found or inactive';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_machine.bet_tiers) t
    WHERE (t->>'coins')::bigint = p_bet
  ) THEN
    RAISE EXCEPTION 'Invalid bet tier: %', p_bet;
  END IF;

  v_today := (now() AT TIME ZONE 'Asia/Taipei')::date;
  IF v_machine.day_reset_date IS DISTINCT FROM v_today THEN
    v_day_spins := 0;
    v_day_rush  := 0;
  ELSE
    v_day_spins := COALESCE(v_machine.day_spins, 0);
    v_day_rush  := COALESCE(v_machine.day_rush, 0);
  END IF;

  INSERT INTO public.slot_sessions (user_id, machine_id)
  VALUES (v_user_id, p_machine_id)
  ON CONFLICT (user_id, machine_id) DO NOTHING;

  SELECT * INTO v_session
  FROM public.slot_sessions
  WHERE user_id = v_user_id AND machine_id = p_machine_id
  FOR UPDATE;

  IF v_machine.rush_state = 'rush' THEN
    RAISE EXCEPTION '機台正在 RUSH 模式中，無法再次直撃';
  END IF;

  -- 收費前檢查：該檔次 RUSH 獎池必須還有庫存（避免收了錢卻無獎可出）
  IF NOT EXISTS (
    SELECT 1
    FROM public.slot_pool_items spi
    LEFT JOIN public.product_prizes pp ON pp.id = spi.product_prize_id
    WHERE spi.machine_id                   = p_machine_id
      AND spi.normal_only                  = FALSE
      AND COALESCE(spi.coin_return, FALSE) = FALSE
      AND (spi.product_prize_id IS NULL OR pp.remaining > 0)
      AND (spi.min_bet IS NULL OR spi.min_bet = p_bet)
  ) THEN
    RAISE EXCEPTION '此檔次獎池已售罄，暫停直擊';
  END IF;

  -- 定價：剩餘保底轉數 × 檔次金額（隨已轉數下降，至少 1 轉）
  v_cost := GREATEST(v_machine.floor_spin_count - COALESCE(v_machine.floor_counter, 0), 1)::bigint * p_bet;

  UPDATE public.users
  SET tokens = tokens - v_cost
  WHERE id = v_user_id AND tokens >= v_cost
  RETURNING tokens INTO v_new_tokens;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'G幣不足，直撃需要 %G', v_cost;
  END IF;

  INSERT INTO public.token_adjustments (user_id, delta, reason, created_by)
  VALUES (
    v_user_id,
    -v_cost,
    FORMAT('直撃進入 RUSH：機台 #%s，檔次 %sG，保底 %s 轉', p_machine_id, p_bet, v_machine.floor_spin_count),
    'system_direct_rush'
  );

  v_day_rush := v_day_rush + 1;

  UPDATE public.slot_machines SET
    rush_state          = 'rush',
    rush_hits_remaining = v_machine.min_rush_hits,
    occupant_id           = v_user_id,
    occupant_active_until = now() + interval '30 seconds',
    occupancy_expires_at  = now() + LEAST(
      GREATEST(COALESCE(v_machine.occupancy_expires_at, now()) - now(), interval '0 seconds')
        + interval '60 seconds',
      interval '90 seconds'
    ),
    rush_locked_bet     = p_bet,
    floor_counter       = 0,
    rush_continue_count = 0,
    rush_from_direct    = FALSE,
    day_spins           = v_day_spins,
    day_rush            = v_day_rush,
    day_reset_date      = v_today
  WHERE id = p_machine_id;

  INSERT INTO public.slot_spin_logs (machine_id, user_id, kind, bet)
  VALUES (p_machine_id, v_user_id, 'direct_entry', v_cost);

  RETURN jsonb_build_object(
    'success',     TRUE,
    'new_balance', v_new_tokens,
    'cost',        v_cost,
    'session', jsonb_build_object(
      'state',               'rush',
      'rush_hits_remaining', v_machine.min_rush_hits,
      'spins_since_rush',    0,
      'floor_counter',       0,
      'total_spins',         COALESCE(v_session.total_spins, 0),
      'locked_bet',          p_bet,
      'day_spins',           v_day_spins,
      'day_rush',            v_day_rush
    )
  );
END;
$function$;
