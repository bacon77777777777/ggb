-- 382_machine_level_floor_and_coin_return.sql
-- 三大設計修改：
-- 1. 保底改為機台層級計數（floor_counter）—— 不再 per-user、per-tier
-- 2. 觸發發改為 coin return（不出 RUSH 品項；RUSH 狀態下才從 RUSH 獎池抽）
-- 3. RUSH 延續率遞減公式：effective = continue_rate × decay^rush_continue_count

-- ── 1. 新增欄位 ──────────────────────────────────────────────────────────────

ALTER TABLE public.slot_machines
  ADD COLUMN IF NOT EXISTS floor_counter        INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rush_continue_count  INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS continue_rate_decay  NUMERIC(5,4) NOT NULL DEFAULT 0.5;

-- ── 2. 重寫 play_slot_locked ─────────────────────────────────────────────────

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
  v_in_rush             BOOL    := FALSE;
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
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 鎖機台列（含機台層級 RUSH / floor 狀態）
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

  v_seed  := md5(p_machine_id::TEXT || v_user_id::TEXT
                 || clock_timestamp()::TEXT || gen_random_uuid()::TEXT);
  v_nonce := floor(random() * 1000000)::INT;
  v_hash  := encode(digest((v_seed || v_nonce::TEXT)::BYTEA, 'sha256'), 'hex');

  v_random := (
    (('x' || substring(v_hash, 1, 16))::BIT(64)::BIGINT)::NUMERIC
    + 9223372036854775808.0
  ) / 18446744073709551616.0;

  -- per-user session（僅記錄 total_spins）
  INSERT INTO public.slot_sessions (user_id, machine_id)
  VALUES (v_user_id, p_machine_id)
  ON CONFLICT (user_id, machine_id) DO NOTHING;

  SELECT * INTO v_session
  FROM public.slot_sessions
  WHERE user_id = v_user_id AND machine_id = p_machine_id
  FOR UPDATE;

  -- 機台 RUSH 狀態
  v_in_rush := (v_machine.rush_state = 'rush' AND v_machine.rush_hits_remaining > 0);

  -- RUSH 中下注鎖定為進入 RUSH 時的 bet
  v_actual_bet := CASE
    WHEN v_in_rush AND v_machine.rush_locked_bet IS NOT NULL THEN v_machine.rush_locked_bet
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

  -- 觸發判斷（只在非 RUSH 狀態）
  -- 保底觸發點：機台已累積 floor_spin_count-1 發 → 本發（第 floor_spin_count 發）強制觸發
  IF NOT v_in_rush THEN
    IF v_machine.floor_counter >= v_machine.floor_spin_count - 1 THEN
      v_rush_triggered := TRUE;
      v_is_ceiling     := TRUE;
    ELSIF v_random < v_machine.trigger_rate THEN
      v_rush_triggered := TRUE;
    END IF;
  END IF;

  -- 抽品項
  -- RUSH 中：從 RUSH 獎池（非 coin_return）抽
  -- 普通旋轉 / 觸發旋轉：只從 coin_return 獎池抽（觸發發同樣退幣，不出品項）
  IF v_in_rush THEN
    SELECT spi.id, spi.product_prize_id, spi.slot_prize_id,
           spi.weight, spi.is_floor, spi.remaining,
           spi.return_multiplier, spi.display_name,
           COALESCE(spi.display_name, pp.name, sp.name) AS prize_name,
           COALESCE(pp.level, sp.level)                  AS prize_level,
           COALESCE(pp.image_url, sp.image_url)          AS prize_image_url,
           pp.product_id,
           COALESCE(pp.recycle_value, 0)                 AS recycle_value
    INTO v_pool_item
    FROM public.slot_pool_items spi
    LEFT JOIN public.product_prizes pp ON pp.id = spi.product_prize_id
    LEFT JOIN public.slot_prizes    sp ON sp.id = spi.slot_prize_id
    WHERE spi.machine_id                   = p_machine_id
      AND spi.normal_only                  = FALSE
      AND COALESCE(spi.coin_return, FALSE) = FALSE
      AND (spi.remaining IS NULL OR spi.remaining > 0)
      AND (spi.min_bet   IS NULL OR spi.min_bet <= v_actual_bet)
    ORDER BY RANDOM() ^ (1.0 / spi.weight) DESC
    LIMIT 1;

  ELSE
    -- 普通 / 觸發旋轉：只從 coin_return 品項抽
    SELECT spi.id, spi.product_prize_id, spi.slot_prize_id,
           spi.weight, spi.is_floor, spi.remaining,
           spi.return_multiplier, spi.display_name,
           COALESCE(spi.display_name, pp.name, sp.name) AS prize_name,
           COALESCE(pp.level, sp.level)                  AS prize_level,
           COALESCE(pp.image_url, sp.image_url)          AS prize_image_url,
           pp.product_id,
           COALESCE(pp.recycle_value, 0)                 AS recycle_value
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

  -- 處理獎品
  IF v_in_rush THEN
    -- RUSH 品項 → 進倉庫
    IF v_pool_item.remaining IS NOT NULL THEN
      UPDATE public.slot_pool_items
      SET remaining = remaining - 1
      WHERE id = v_pool_item.id AND remaining > 0;

      GET DIAGNOSTICS v_updated = ROW_COUNT;
      IF v_updated = 0 THEN
        RAISE EXCEPTION 'Prize just ran out, please spin again';
      END IF;
    END IF;

    IF v_pool_item.slot_prize_id IS NOT NULL THEN
      UPDATE public.slot_prizes
      SET remaining = remaining - 1
      WHERE id = v_pool_item.slot_prize_id
        AND remaining IS NOT NULL AND remaining > 0;
    END IF;

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
    -- Coin return（普通 / 觸發旋轉）→ 退幣
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
    -- 觸發 RUSH：機台進 RUSH，本發不消耗 hits
    -- rush_hits_remaining = min_rush_hits，等真正 RUSH 旋轉才開始扣
    v_state               := 'rush';
    v_rush_hits_remaining := v_machine.min_rush_hits;
    v_new_floor_counter   := 0;   -- 觸發後重置保底計數
    v_new_rush_continue   := 0;

  ELSIF v_in_rush THEN
    -- RUSH 旋轉：消耗一次保底 hits
    v_rush_hits_remaining := v_machine.rush_hits_remaining - 1;
    v_new_floor_counter   := v_machine.floor_counter;  -- RUSH 中不累計保底

    IF v_rush_hits_remaining > 0 THEN
      -- 仍有保底 hits，繼續 RUSH
      v_state             := 'rush';
      v_new_rush_continue := v_machine.rush_continue_count;

    ELSE
      -- 保底 hits 耗盡，計算遞減延續率
      -- effective_rate = continue_rate × decay^rush_continue_count
      v_effective_rate := v_machine.continue_rate
                          * POWER(
                              COALESCE(v_machine.continue_rate_decay, 0.5),
                              v_machine.rush_continue_count::NUMERIC
                            );

      IF random() < v_effective_rate THEN
        -- 延續！追加 1 發，延續次數 +1
        v_state               := 'rush';
        v_rush_hits_remaining := 1;
        v_new_rush_continue   := v_machine.rush_continue_count + 1;
      ELSE
        -- RUSH 結束
        v_state               := 'normal';
        v_rush_hits_remaining := 0;
        v_new_rush_continue   := 0;
        v_new_floor_counter   := 0;  -- RUSH 結束，保底從零開始
      END IF;
    END IF;

  ELSE
    -- 普通旋轉（非觸發）：保底計數 +1
    v_state               := 'normal';
    v_rush_hits_remaining := 0;
    v_new_floor_counter   := v_machine.floor_counter + 1;
    v_new_rush_continue   := 0;
  END IF;

  -- rush_locked_bet：只在 RUSH 狀態保留
  v_locked_bet_out := CASE
    WHEN v_state = 'rush' AND v_rush_triggered THEN v_actual_bet
    WHEN v_state = 'rush'                      THEN v_machine.rush_locked_bet
    ELSE                                            NULL
  END;

  -- 更新 per-user session（只追蹤 total_spins）
  UPDATE public.slot_sessions SET
    total_spins = total_spins + 1,
    updated_at  = NOW()
  WHERE user_id = v_user_id AND machine_id = p_machine_id;

  -- 更新機台層級狀態
  UPDATE public.slot_machines SET
    rush_state          = v_state,
    rush_hits_remaining = v_rush_hits_remaining,
    rush_locked_bet     = v_locked_bet_out,
    floor_counter       = v_new_floor_counter,
    rush_continue_count = v_new_rush_continue
  WHERE id = p_machine_id;

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
      'locked_bet',          v_locked_bet_out
    ),
    'rush_triggered', v_rush_triggered,
    'is_ceiling',     v_is_ceiling
  );
END;
$function$;

-- ── 3. 更新 enter_slot_rush_direct：改用機台層級 floor_counter ──────────────

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
  v_remaining  INT;
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

  INSERT INTO public.slot_sessions (user_id, machine_id)
  VALUES (v_user_id, p_machine_id)
  ON CONFLICT (user_id, machine_id) DO NOTHING;

  SELECT * INTO v_session
  FROM public.slot_sessions
  WHERE user_id = v_user_id AND machine_id = p_machine_id
  FOR UPDATE;

  IF v_machine.rush_state = 'rush' AND v_machine.rush_hits_remaining > 0 THEN
    RAISE EXCEPTION '機台正在 RUSH 模式中，無法再次直撃';
  END IF;

  -- 費用 = max(min_rush_hits, floor_spin_count - floor_counter) × bet（機台層級）
  v_remaining := GREATEST(
    v_machine.min_rush_hits,
    v_machine.floor_spin_count - COALESCE(v_machine.floor_counter, 0)
  );
  v_cost := v_remaining * p_bet;

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
    FORMAT('直撃進入 RUSH：機台 #%s，%sG × %s次', p_machine_id, p_bet, v_remaining),
    'system_direct_rush'
  );

  UPDATE public.slot_machines SET
    rush_state          = 'rush',
    rush_hits_remaining = v_machine.min_rush_hits,
    rush_locked_bet     = p_bet,
    floor_counter       = 0,
    rush_continue_count = 0
  WHERE id = p_machine_id;

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
      'locked_bet',          p_bet
    )
  );
END;
$function$;
