-- 385_jackpot_model_tiers_and_exclusive_pool.sql
-- 老虎機改為柏青哥式 jackpot 模型（對標日本スロット風オリパ競品）：
--
-- 1. RUSH 獎池改「檔次專屬」：min_bet = 鎖定檔次才抽得到（NULL = 全檔通用）
--    舊邏輯 min_bet <= bet 會讓高檔玩家抽到低檔便宜卡
-- 2. 投注檔次：100~2000G → 10/20/50/100/300G（以小博大，低單價慢玩）
-- 3. 正式參數：觸發率 0.2%（自然均值 1/500）、保底 1,400 轉（≈均值 2.8 倍，柏青哥天井慣例）
--    保底連數 1、延續率 50%、遞減 50% → 平均 1.64 張/次 RUSH
-- 4. 獎池單卡帶 = 檔次的 45~65 倍（均獎 ≈50 倍），總 RTP ≈ 83%
-- 5. 重置機台 RUSH 狀態（舊 locked_bet 已不在新檔次表內，不重置會以舊高額扣款）
--
-- 注意：STG 測試期由 psql 另將 trigger_rate 調為 2% 方便跑流程，推正前需確認為 0.002

-- ── 1. play_slot_locked：RUSH 池改檔次專屬 ──────────────────────────────────

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
  -- RUSH 品項轉：從 RUSH 獎池抽，「檔次專屬」——min_bet = 鎖定檔次（NULL = 全檔通用）
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
      AND (spi.min_bet   IS NULL OR spi.min_bet = v_actual_bet)
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

-- ── 2. 新檔次與正式參數（theme + 同步所有機台）─────────────────────────────

UPDATE public.slot_themes SET
  bet_tiers           = '[{"coins":10},{"coins":20},{"coins":50},{"coins":100},{"coins":300}]'::jsonb,
  trigger_rate        = 0.002,
  floor_spin_count    = 1400,
  min_rush_hits       = 1,
  continue_rate       = 0.5,
  continue_rate_decay = 0.5,
  updated_at          = now();

UPDATE public.slot_machines SET
  bet_tiers           = '[{"coins":10},{"coins":20},{"coins":50},{"coins":100},{"coins":300}]'::jsonb,
  trigger_rate        = 0.002,
  floor_spin_count    = 1400,
  min_rush_hits       = 1,
  continue_rate       = 0.5,
  continue_rate_decay = 0.5,
  price_per_spin      = 10,
  updated_at          = now();

-- ── 3. 重置機台 RUSH 狀態（舊 locked_bet 不在新檔次表，避免以舊高額扣款）────

UPDATE public.slot_machines SET
  rush_state          = 'normal',
  rush_hits_remaining = 0,
  rush_locked_bet     = NULL,
  floor_counter       = 0,
  rush_continue_count = 0;
