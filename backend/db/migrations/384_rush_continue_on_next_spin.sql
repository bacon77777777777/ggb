-- 384_rush_continue_on_next_spin.sql
-- RUSH 延續判定移到「下一轉」，修正玩家在紫色機台上看到「RUSH 突入」的體感錯誤：
--
-- 舊設計：保底 hits 耗盡的那一轉「當場」擲延續率 → 沒過立即回 normal，
--         下一轉是普通轉（會擲觸發率）→ 觸發率高時馬上又突入，看起來像 RUSH 中又觸發。
--
-- 新設計（狀態機）：
--   state='rush' AND hits>0  → 保底連中轉：出 RUSH 品項（777），hits-1，state 維持 rush（含 hits=0）
--   state='rush' AND hits=0  → 延續判定轉：擲 continue_rate × decay^連中次數
--       過   → 本轉出 RUSH 品項（777 連中），hits 維持 0，連中次數+1
--       沒過 → 本轉為退幣轉（非 777 揭曉），回 normal，保底歸零。此轉絕不擲觸發率
--   state='normal'           → 普通轉：擲觸發率 / 保底
--
-- RUSH 狀態（含延續判定中）永遠不會觸發新 RUSH。

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
  v_day_spins           INTEGER;
  v_day_rush            INTEGER;
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

  -- per-user session（僅記錄 total_spins）
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
  IF v_pending_continue THEN
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
  -- RUSH 品項轉（保底連中 / 延續判定通過）：從 RUSH 獎池（非 coin_return）抽
  -- 其他（普通 / 觸發 / 延續失敗揭曉）：只從 coin_return 獎池抽（退幣）
  IF v_rush_prize_spin THEN
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
  IF v_rush_prize_spin THEN
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
    -- Coin return（普通 / 觸發 / 延續失敗揭曉）→ 退幣
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
    -- 觸發 RUSH（僅普通狀態可達）：本發退幣，hits = min_rush_hits 待 RUSH 轉消耗
    v_state               := 'rush';
    v_rush_hits_remaining := v_machine.min_rush_hits;
    v_new_floor_counter   := 0;
    v_new_rush_continue   := 0;

  ELSIF v_in_rush_hits THEN
    -- 保底連中轉：hits-1，state 維持 rush（hits=0 → 下一轉為延續判定轉）
    v_state               := 'rush';
    v_rush_hits_remaining := v_machine.rush_hits_remaining - 1;
    v_new_floor_counter   := v_machine.floor_counter;
    v_new_rush_continue   := v_machine.rush_continue_count;

  ELSIF v_continued THEN
    -- 延續判定通過：本轉已出品項，hits 維持 0（下一轉再判定），連中次數 +1
    v_state               := 'rush';
    v_rush_hits_remaining := 0;
    v_new_floor_counter   := v_machine.floor_counter;
    v_new_rush_continue   := v_machine.rush_continue_count + 1;

  ELSIF v_rush_ended THEN
    -- 延續判定失敗：本轉為非 777 退幣揭曉，RUSH 結束，保底歸零重算
    v_state               := 'normal';
    v_rush_hits_remaining := 0;
    v_new_floor_counter   := 0;
    v_new_rush_continue   := 0;

  ELSE
    -- 普通旋轉（非觸發）：保底計數 +1
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
    rush_continue_count = v_new_rush_continue,
    day_spins           = v_day_spins,
    day_rush            = v_day_rush,
    day_reset_date      = v_today
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
      'locked_bet',          v_locked_bet_out,
      'day_spins',           v_day_spins,
      'day_rush',            v_day_rush
    ),
    'rush_triggered', v_rush_triggered,
    'is_ceiling',     v_is_ceiling
  );
END;
$function$;

-- enter_slot_rush_direct：RUSH 狀態（含延續判定中）禁止直撃
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

  -- 每日統計：台灣時間跨日自動清零
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

  v_day_rush := v_day_rush + 1;

  UPDATE public.slot_machines SET
    rush_state          = 'rush',
    rush_hits_remaining = v_machine.min_rush_hits,
    rush_locked_bet     = p_bet,
    floor_counter       = 0,
    rush_continue_count = 0,
    day_spins           = v_day_spins,
    day_rush            = v_day_rush,
    day_reset_date      = v_today
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
      'locked_bet',          p_bet,
      'day_spins',           v_day_spins,
      'day_rush',            v_day_rush
    )
  );
END;
$function$;
