-- 400: 機台模組檢測修補
-- 1. RUSH 獎池售罄時：出獎轉優雅退化為退幣揭曉並結束 RUSH（原本 RAISE 導致卡死、直擊吞錢）
-- 2. 直擊收費前檢查該檔次獎池庫存，售罄直接擋下不收費

CREATE OR REPLACE FUNCTION public.play_slot_locked(p_machine_id bigint, p_bet bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user_id             UUID;
  v_machine             RECORD;
  v_session             RECORD;
  v_pool_item           RECORD;
  v_draw_record_id      BIGINT;
  v_in_rush_hits        BOOL    := FALSE;  -- 保底連中轉（hits>0）
  v_pending_continue    BOOL    := FALSE;  -- 延續判定轉（state=rush, hits=0）
  v_rush_prize_spin     BOOL    := FALSE;  -- 本轉出 RUSH 品項
  v_continued           BOOL    := FALSE;  -- 延續判定通過
  v_rush_ended          BOOL    := FALSE;  -- 延續判定失敗，RUSH 結束
  v_rush_triggered      BOOL    := FALSE;
  v_is_ceiling          BOOL    := FALSE;
  v_is_coin_return      BOOL    := FALSE;
  v_coin_return_amount  BIGINT  := 0;
  v_new_tokens          BIGINT;
  v_rush_hits_remaining INTEGER;
  v_state               TEXT;
  v_updated             INT;
  v_actual_bet          BIGINT;
  v_locked_bet_out      BIGINT;
  v_seed                TEXT;
  v_nonce               INT;
  v_hash                TEXT;
  v_random              NUMERIC;
  v_new_floor_counter   INTEGER;
  v_new_rush_continue   INTEGER;
  v_effective_rate      NUMERIC;
  v_today               DATE;
  v_excluded            BIGINT[] := '{}';
  v_day_spins           INTEGER;
  v_day_rush            INTEGER;
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

  -- 每日統計：台灣時間跨日自動清零
  v_today := (now() AT TIME ZONE 'Asia/Taipei')::date;
  IF v_machine.day_reset_date IS DISTINCT FROM v_today THEN
    v_day_spins := 0;
    v_day_rush  := 0;
  ELSE
    v_day_spins := COALESCE(v_machine.day_spins, 0);
    v_day_rush  := COALESCE(v_machine.day_rush, 0);
  END IF;

  v_seed  := md5(p_machine_id::TEXT || v_user_id::TEXT
                 || clock_timestamp()::TEXT || gen_random_uuid()::TEXT);
  v_nonce := floor(random() * 1000000)::INT;
  v_hash  := encode(digest((v_seed || v_nonce::TEXT)::BYTEA, 'sha256'), 'hex');

  v_random := (
    (('x' || substring(v_hash, 1, 16))::BIT(64)::BIGINT)::NUMERIC
    + 9223372036854775808.0
  ) / 18446744073709551616.0;

  INSERT INTO public.slot_sessions (user_id, machine_id)
  VALUES (v_user_id, p_machine_id)
  ON CONFLICT (user_id, machine_id) DO NOTHING;

  SELECT * INTO v_session
  FROM public.slot_sessions
  WHERE user_id = v_user_id AND machine_id = p_machine_id
  FOR UPDATE;

  -- 機台 RUSH 狀態機
  v_in_rush_hits     := (v_machine.rush_state = 'rush' AND v_machine.rush_hits_remaining > 0);
  v_pending_continue := (v_machine.rush_state = 'rush' AND v_machine.rush_hits_remaining = 0);
  v_rush_prize_spin  := v_in_rush_hits;

  -- 延續判定轉：先擲延續率決定本轉性質（連中出品項 / 退幣揭曉結束）
  -- 直擊進入的 RUSH：買斷一次出獎，不觸發延續
  IF v_pending_continue THEN
    IF COALESCE(v_machine.rush_from_direct, FALSE) THEN
      v_rush_ended := TRUE;
    ELSE
      v_effective_rate := v_machine.continue_rate
                          * POWER(
                              COALESCE(v_machine.continue_rate_decay, 0.5),
                              v_machine.rush_continue_count::NUMERIC
                            );
      IF random() < v_effective_rate THEN
        v_continued       := TRUE;
        v_rush_prize_spin := TRUE;
      ELSE
        v_rush_ended := TRUE;
      END IF;
    END IF;
  END IF;

  -- RUSH 中（含延續判定轉）下注鎖定為進入 RUSH 時的 bet
  v_actual_bet := CASE
    WHEN v_machine.rush_state = 'rush' AND v_machine.rush_locked_bet IS NOT NULL
      THEN v_machine.rush_locked_bet
    ELSE p_bet
  END;

  -- 扣幣
  UPDATE public.users
  SET tokens = tokens - v_actual_bet
  WHERE id = v_user_id AND tokens >= v_actual_bet
  RETURNING tokens INTO v_new_tokens;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient token balance';
  END IF;

  -- 觸發判斷：只在普通狀態（RUSH 中、延續判定轉一律不觸發）
  IF v_machine.rush_state IS DISTINCT FROM 'rush' THEN
    IF v_machine.floor_counter >= v_machine.floor_spin_count - 1 THEN
      v_rush_triggered := TRUE;
      v_is_ceiling     := TRUE;
    ELSIF v_random < v_machine.trigger_rate THEN
      v_rush_triggered := TRUE;
    END IF;
  END IF;

  -- 抽品項
  -- RUSH 品項轉：從 RUSH 獎池抽，「檔次專屬」——min_bet = 鎖定檔次（NULL = 全檔通用）
  -- 其他（普通 / 觸發 / 延續失敗揭曉）：只從 coin_return 獎池抽（退幣）
  IF v_rush_prize_spin THEN
    -- 共用庫存：以 product_prizes.remaining 為準（同主題 5 台共用）。
    -- 撞庫存（兩台同時抽到最後一件）時條件式扣減只有一台成功，
    -- 失敗的一台把該品項排除後重抽，用戶無感。
    LOOP
      SELECT spi.id, spi.product_prize_id, spi.slot_prize_id,
             spi.weight, spi.is_floor, spi.remaining,
             spi.return_multiplier, spi.display_name,
             COALESCE(spi.display_name, pp.name, sp.name) AS prize_name,
             COALESCE(pp.level, sp.level)                  AS prize_level,
             COALESCE(pp.image_url, sp.image_url)          AS prize_image_url,
             pp.product_id,
             COALESCE(pp.recycle_value, sp.recycle_value, 0) AS recycle_value
      INTO v_pool_item
      FROM public.slot_pool_items spi
      LEFT JOIN public.product_prizes pp ON pp.id = spi.product_prize_id
      LEFT JOIN public.slot_prizes    sp ON sp.id = spi.slot_prize_id
      WHERE spi.machine_id                   = p_machine_id
        AND spi.normal_only                  = FALSE
        AND COALESCE(spi.coin_return, FALSE) = FALSE
        AND (spi.min_bet   IS NULL OR spi.min_bet = v_actual_bet)
        AND (spi.product_prize_id IS NULL
             OR (pp.remaining > 0 AND NOT (pp.id = ANY(v_excluded))))
      ORDER BY RANDOM() ^ (1.0 / spi.weight) DESC
      LIMIT 1;

      IF v_pool_item IS NULL THEN
        -- RUSH 獎池售罄：本轉退化為退幣揭曉、RUSH 結束（不吞玩家的轉）
        v_rush_prize_spin := FALSE;
        v_in_rush_hits    := FALSE;
        v_continued       := FALSE;
        v_rush_ended      := TRUE;
        EXIT;
      END IF;

      EXIT WHEN v_pool_item.product_prize_id IS NULL;

      UPDATE public.product_prizes
      SET remaining = remaining - 1
      WHERE id = v_pool_item.product_prize_id AND remaining > 0;
      GET DIAGNOSTICS v_updated = ROW_COUNT;
      EXIT WHEN v_updated > 0;

      v_excluded := array_append(v_excluded, v_pool_item.product_prize_id);
    END LOOP;

    UPDATE public.products
    SET remaining = GREATEST(remaining - 1, 0)
    WHERE id = v_pool_item.product_id;

  ELSE
    SELECT spi.id, spi.product_prize_id, spi.slot_prize_id,
           spi.weight, spi.is_floor, spi.remaining,
           spi.return_multiplier, spi.display_name,
           COALESCE(spi.display_name, pp.name, sp.name) AS prize_name,
           COALESCE(pp.level, sp.level)                  AS prize_level,
           COALESCE(pp.image_url, sp.image_url)          AS prize_image_url,
           pp.product_id,
           COALESCE(pp.recycle_value, sp.recycle_value, 0) AS recycle_value
    INTO v_pool_item
    FROM public.slot_pool_items spi
    LEFT JOIN public.product_prizes pp ON pp.id = spi.product_prize_id
    LEFT JOIN public.slot_prizes    sp ON sp.id = spi.slot_prize_id
    WHERE spi.machine_id                   = p_machine_id
      AND COALESCE(spi.coin_return, FALSE) = TRUE
      AND (spi.remaining IS NULL OR spi.remaining > 0)
      AND (spi.min_bet   IS NULL OR spi.min_bet <= v_actual_bet)
    ORDER BY RANDOM() ^ (1.0 / spi.weight) DESC
    LIMIT 1;
  END IF;

  -- RUSH 池售罄退化：改抽退幣池
  IF v_pool_item IS NULL AND NOT v_rush_prize_spin THEN
    SELECT spi.id, spi.product_prize_id, spi.slot_prize_id,
           spi.weight, spi.is_floor, spi.remaining,
           spi.return_multiplier, spi.display_name,
           COALESCE(spi.display_name, pp.name, sp.name) AS prize_name,
           COALESCE(pp.level, sp.level)                  AS prize_level,
           COALESCE(pp.image_url, sp.image_url)          AS prize_image_url,
           pp.product_id,
           COALESCE(pp.recycle_value, sp.recycle_value, 0) AS recycle_value
    INTO v_pool_item
    FROM public.slot_pool_items spi
    LEFT JOIN public.product_prizes pp ON pp.id = spi.product_prize_id
    LEFT JOIN public.slot_prizes    sp ON sp.id = spi.slot_prize_id
    WHERE spi.machine_id                   = p_machine_id
      AND COALESCE(spi.coin_return, FALSE) = TRUE
      AND (spi.remaining IS NULL OR spi.remaining > 0)
      AND (spi.min_bet   IS NULL OR spi.min_bet <= v_actual_bet)
    ORDER BY RANDOM() ^ (1.0 / spi.weight) DESC
    LIMIT 1;
  END IF;

  IF v_pool_item IS NULL THEN
    RAISE EXCEPTION 'No prizes configured for this machine';
  END IF;

  -- 處理獎品（庫存已於抽選 LOOP 內扣減）
  IF v_rush_prize_spin THEN
    INSERT INTO public.draw_records (
      user_id, product_id, product_prize_id,
      prize_name, prize_level, prize_image_url,
      status, txid_seed, txid_nonce, txid_hash, random_value
    ) VALUES (
      v_user_id,
      v_pool_item.product_id,
      v_pool_item.product_prize_id,
      v_pool_item.prize_name,
      v_pool_item.prize_level,
      v_pool_item.prize_image_url,
      'in_warehouse',
      v_seed, v_nonce, v_hash, v_random
    )
    RETURNING id INTO v_draw_record_id;

    UPDATE public.users
    SET total_draws = COALESCE(total_draws, 0) + 1
    WHERE id = v_user_id;

  ELSE
    v_is_coin_return     := TRUE;
    v_coin_return_amount := floor(v_actual_bet * COALESCE(v_pool_item.return_multiplier, 0))::BIGINT;

    IF v_coin_return_amount > 0 THEN
      UPDATE public.users
      SET tokens = tokens + v_coin_return_amount
      WHERE id = v_user_id
      RETURNING tokens INTO v_new_tokens;
    END IF;

    INSERT INTO public.draw_records (
      user_id, product_id, product_prize_id,
      prize_name, prize_level, prize_image_url,
      status, txid_seed, txid_nonce, txid_hash, random_value
    ) VALUES (
      v_user_id, NULL, NULL,
      v_pool_item.prize_name,
      'coin_return', NULL, 'coin_return',
      v_seed, v_nonce, v_hash, v_random
    )
    RETURNING id INTO v_draw_record_id;
  END IF;

  -- 更新機台狀態
  IF v_rush_triggered THEN
    v_state               := 'rush';
    v_rush_hits_remaining := v_machine.min_rush_hits;
    v_new_floor_counter   := 0;
    v_new_rush_continue   := 0;

  ELSIF v_in_rush_hits THEN
    v_state               := 'rush';
    v_rush_hits_remaining := v_machine.rush_hits_remaining - 1;
    v_new_floor_counter   := v_machine.floor_counter;
    v_new_rush_continue   := v_machine.rush_continue_count;

  ELSIF v_continued THEN
    v_state               := 'rush';
    v_rush_hits_remaining := 0;
    v_new_floor_counter   := v_machine.floor_counter;
    v_new_rush_continue   := v_machine.rush_continue_count + 1;

  ELSIF v_rush_ended THEN
    v_state               := 'normal';
    v_rush_hits_remaining := 0;
    v_new_floor_counter   := 0;
    v_new_rush_continue   := 0;

  ELSE
    v_state               := 'normal';
    v_rush_hits_remaining := 0;
    v_new_floor_counter   := v_machine.floor_counter + 1;
    v_new_rush_continue   := 0;
  END IF;

  -- 每日統計累加
  v_day_spins := v_day_spins + 1;
  IF v_rush_triggered THEN
    v_day_rush := v_day_rush + 1;
  END IF;

  v_locked_bet_out := CASE
    WHEN v_state = 'rush' AND v_rush_triggered THEN v_actual_bet
    WHEN v_state = 'rush'                      THEN v_machine.rush_locked_bet
    ELSE                                            NULL
  END;

  UPDATE public.slot_sessions SET
    total_spins = total_spins + 1,
    updated_at  = NOW()
  WHERE user_id = v_user_id AND machine_id = p_machine_id;

  UPDATE public.slot_machines SET
    rush_state          = v_state,
    rush_hits_remaining = v_rush_hits_remaining,
    rush_from_direct    = CASE WHEN v_state = 'normal' THEN FALSE ELSE COALESCE(v_machine.rush_from_direct, FALSE) END,
    occupant_id           = v_user_id,
    occupant_active_until = now() + interval '30 seconds',
    occupancy_expires_at  = now() + LEAST(
      GREATEST(COALESCE(v_machine.occupancy_expires_at, now()) - now(), interval '0 seconds')
        + interval '60 seconds',
      interval '90 seconds'
    ),
    rush_locked_bet     = v_locked_bet_out,
    floor_counter       = v_new_floor_counter,
    rush_continue_count = v_new_rush_continue,
    day_spins           = v_day_spins,
    day_rush            = v_day_rush,
    day_reset_date      = v_today
  WHERE id = p_machine_id;

  -- 報表流水
  INSERT INTO public.slot_spin_logs (
    machine_id, user_id, kind, bet, coin_return, prize_value, prize_name, draw_record_id
  ) VALUES (
    p_machine_id,
    v_user_id,
    CASE
      WHEN v_rush_triggered THEN 'rush_trigger'
      WHEN v_in_rush_hits   THEN 'rush_hit'
      WHEN v_continued      THEN 'rush_continue'
      WHEN v_rush_ended     THEN 'rush_end'
      ELSE 'normal'
    END,
    v_actual_bet,
    v_coin_return_amount,
    CASE WHEN v_rush_prize_spin THEN COALESCE(v_pool_item.recycle_value, 0) ELSE 0 END,
    v_pool_item.prize_name,
    v_draw_record_id
  );

  RETURN jsonb_build_object(
    'success',            TRUE,
    'new_balance',        v_new_tokens,
    'draw_record_id',     v_draw_record_id,
    'bet',                v_actual_bet,
    'is_coin_return',     v_is_coin_return,
    'coin_return_amount', v_coin_return_amount,
    'prize', jsonb_build_object(
      'pool_item_id',  v_pool_item.id,
      'prize_id',      COALESCE(v_pool_item.product_prize_id::TEXT, v_pool_item.slot_prize_id::TEXT),
      'name',          v_pool_item.prize_name,
      'level',         v_pool_item.prize_level,
      'image_url',     v_pool_item.prize_image_url,
      'recycle_value', COALESCE(v_pool_item.recycle_value, 0)
    ),
    'session', jsonb_build_object(
      'state',               v_state,
      'rush_hits_remaining', v_rush_hits_remaining,
      'spins_since_rush',    v_new_floor_counter,
      'floor_counter',       v_new_floor_counter,
      'total_spins',         COALESCE(v_session.total_spins, 0) + 1,
      'locked_bet',          v_locked_bet_out,
      'day_spins',           v_day_spins,
      'day_rush',            v_day_rush
    ),
    'rush_triggered', v_rush_triggered,
    'is_ceiling',     v_is_ceiling
  );
END;
$function$;

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

  -- 定價：保底轉數 × 檔次金額
  v_cost := v_machine.floor_spin_count::bigint * p_bet;

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
