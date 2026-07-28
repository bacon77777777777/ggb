-- Migration 352: play_slot_locked 修正
-- P0: 加權隨機公式修正 — RANDOM()^(1/weight) Efraimidis-Spirakis
-- P1: 公平性存根 — txid_seed / txid_hash / random_value
-- P1: RUSH 收費 TODO 標記
-- P2: 空池 fallback — 永遠不炸 "No prizes available"
-- P2: 超賣防護 — GET DIAGNOSTICS ROW_COUNT

CREATE OR REPLACE FUNCTION public.play_slot_locked(p_machine_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id             UUID;
  v_machine             RECORD;
  v_session             RECORD;
  v_pool_item           RECORD;
  v_draw_record_id      BIGINT;
  v_in_rush             BOOL    := FALSE;
  v_rush_triggered      BOOL    := FALSE;
  v_is_floor            BOOL    := FALSE;
  v_new_tokens          INT;
  v_rush_hits_remaining INT;     -- NULL 初始值，rush_triggered 才賦值
  v_spins_since_rush    INT;
  v_state               TEXT;
  v_updated             INT;
  -- 公平性存根
  v_seed                TEXT;
  v_nonce               INT;
  v_hash                TEXT;
  v_random              NUMERIC; -- 0~1，用於 trigger 判斷 + 寫入 draw_records
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

  -- ── 公平性存根（同 play_gacha 模式）──────────────────────
  -- seed = machine_id + user_id + clock_timestamp + uuid，不可預測
  v_seed   := md5(p_machine_id::TEXT || v_user_id::TEXT
                  || clock_timestamp()::TEXT || gen_random_uuid()::TEXT);
  v_nonce  := floor(random() * 1000000)::INT;
  v_hash   := encode(digest((v_seed || v_nonce::TEXT)::BYTEA, 'sha256'), 'hex');
  -- 轉成 0~1 浮點數，作為本次轉動的「已承諾亂數」
  v_random := (('x' || substring(v_hash, 1, 16))::BIT(64)::BIGINT)::NUMERIC
              / 18446744073709551615.0;

  -- TODO(老闆決策): RUSH 中是否仍然扣幣？
  -- 目前：每轉固定扣 price_per_spin（含 RUSH 轉）。
  -- 若改為「RUSH 免費」，請將下方扣款移入「IF NOT v_in_rush THEN … END IF」區段。
  UPDATE public.users
  SET tokens = tokens - v_machine.price_per_spin
  WHERE id = v_user_id AND tokens >= v_machine.price_per_spin
  RETURNING tokens INTO v_new_tokens;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient token balance';
  END IF;

  -- Get or create session
  INSERT INTO public.slot_sessions (user_id, machine_id)
  VALUES (v_user_id, p_machine_id)
  ON CONFLICT (user_id, machine_id) DO NOTHING;

  SELECT * INTO v_session
  FROM public.slot_sessions
  WHERE user_id = v_user_id AND machine_id = p_machine_id
  FOR UPDATE;

  -- ── 狀態機 ────────────────────────────────────────────────
  v_in_rush := (v_session.state = 'rush' AND v_session.rush_hits_remaining > 0);

  IF NOT v_in_rush THEN
    -- 保底：連續未觸發 RUSH 達閾值 → 強制觸發
    IF v_session.spins_since_rush >= v_machine.floor_spin_count THEN
      v_in_rush        := TRUE;
      v_rush_triggered := TRUE;
      v_is_floor       := TRUE;
    -- 用已承諾亂數判斷觸發（v_random 已寫入 draw_record，可驗證）
    ELSIF v_random < v_machine.trigger_rate THEN
      v_in_rush        := TRUE;
      v_rush_triggered := TRUE;
    END IF;

    IF v_rush_triggered THEN
      v_rush_hits_remaining := v_machine.min_rush_hits;
    END IF;
  END IF;

  -- ── 抽選（Efraimidis-Spirakis：RANDOM()^(1/weight) 才是正確加權）──
  IF v_is_floor THEN
    -- 保底：強制給 is_floor 品項
    SELECT spi.id, spi.product_prize_id, spi.weight, spi.is_floor, spi.remaining,
           pp.name AS prize_name, pp.level AS prize_level,
           pp.image_url AS prize_image_url, pp.product_id, pp.recycle_value
    INTO v_pool_item
    FROM public.slot_pool_items spi
    JOIN public.product_prizes pp ON pp.id = spi.product_prize_id
    WHERE spi.machine_id = p_machine_id AND spi.is_floor = TRUE
    LIMIT 1;

  ELSIF v_in_rush THEN
    -- RUSH 模式：排除 normal_only / is_floor，加權抽選
    SELECT spi.id, spi.product_prize_id, spi.weight, spi.is_floor, spi.remaining,
           pp.name AS prize_name, pp.level AS prize_level,
           pp.image_url AS prize_image_url, pp.product_id, pp.recycle_value
    INTO v_pool_item
    FROM public.slot_pool_items spi
    JOIN public.product_prizes pp ON pp.id = spi.product_prize_id
    WHERE spi.machine_id  = p_machine_id
      AND spi.is_floor    = FALSE
      AND spi.normal_only = FALSE
      AND (spi.remaining IS NULL OR spi.remaining > 0)
    ORDER BY RANDOM() ^ (1.0 / spi.weight) DESC
    LIMIT 1;

  ELSE
    -- 正常模式：排除 rush_only / is_floor，加權抽選
    SELECT spi.id, spi.product_prize_id, spi.weight, spi.is_floor, spi.remaining,
           pp.name AS prize_name, pp.level AS prize_level,
           pp.image_url AS prize_image_url, pp.product_id, pp.recycle_value
    INTO v_pool_item
    FROM public.slot_pool_items spi
    JOIN public.product_prizes pp ON pp.id = spi.product_prize_id
    WHERE spi.machine_id = p_machine_id
      AND spi.is_floor   = FALSE
      AND spi.rush_only  = FALSE
      AND (spi.remaining IS NULL OR spi.remaining > 0)
    ORDER BY RANDOM() ^ (1.0 / spi.weight) DESC
    LIMIT 1;
  END IF;

  -- P2 fallback：一般/RUSH 池耗盡時，退守 is_floor 保底品，永不炸
  IF v_pool_item IS NULL AND NOT v_is_floor THEN
    SELECT spi.id, spi.product_prize_id, spi.weight, spi.is_floor, spi.remaining,
           pp.name AS prize_name, pp.level AS prize_level,
           pp.image_url AS prize_image_url, pp.product_id, pp.recycle_value
    INTO v_pool_item
    FROM public.slot_pool_items spi
    JOIN public.product_prizes pp ON pp.id = spi.product_prize_id
    WHERE spi.machine_id = p_machine_id AND spi.is_floor = TRUE
    LIMIT 1;
    v_is_floor := TRUE;
  END IF;

  IF v_pool_item IS NULL THEN
    RAISE EXCEPTION 'No prizes configured for this machine';
  END IF;

  -- ── 庫存扣減 + 超賣防護 ───────────────────────────────────
  IF v_pool_item.remaining IS NOT NULL THEN
    UPDATE public.slot_pool_items
    SET remaining = remaining - 1
    WHERE id = v_pool_item.id AND remaining > 0;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    -- 若扣減到 0 筆代表並發搶走了最後一個，整筆 rollback 讓 client retry
    IF v_updated = 0 THEN
      RAISE EXCEPTION 'Prize just ran out, please spin again';
    END IF;
  END IF;

  -- ── draw_record 入庫（含公平性存根）───────────────────────
  INSERT INTO public.draw_records (
    user_id, product_id, product_prize_id,
    prize_name, prize_level, prize_image_url,
    status,
    txid_seed, txid_nonce, txid_hash, random_value
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

  -- ── 更新 session 狀態 ──────────────────────────────────────
  IF v_in_rush THEN
    -- COALESCE: 新觸發用 min_rush_hits；既有 RUSH 用 session 殘值
    v_rush_hits_remaining := COALESCE(
      v_rush_hits_remaining,              -- rush_triggered 時已設為 min_rush_hits
      v_session.rush_hits_remaining       -- 既有 RUSH 延續
    ) - 1;

    IF v_rush_hits_remaining <= 0 THEN
      -- RUSH 次數耗盡，再滾一次 continue_rate
      IF random() < v_machine.continue_rate THEN
        v_rush_hits_remaining := 1;
        v_state               := 'rush';
      ELSE
        v_rush_hits_remaining := 0;
        v_state               := 'normal';
      END IF;
    ELSE
      v_state := 'rush';
    END IF;

    v_spins_since_rush := 0;  -- 進 RUSH 就重置保底計數
  ELSE
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

  -- ── 回傳 ──────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'success',        TRUE,
    'new_balance',    v_new_tokens,
    'draw_record_id', v_draw_record_id,
    'prize', jsonb_build_object(
      'pool_item_id',  v_pool_item.id,
      'prize_id',      v_pool_item.product_prize_id,
      'name',          v_pool_item.prize_name,
      'level',         v_pool_item.prize_level,
      'image_url',     v_pool_item.prize_image_url,
      'recycle_value', v_pool_item.recycle_value
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
