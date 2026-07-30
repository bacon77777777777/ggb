-- Fix: play_slot_locked v_random 值會出現負數的 bug
--
-- 問題：BIT(64)::BIGINT 是 signed，約 50% 的 SHA256 hash 首 16 hex 會有
--       MSB=1，導致 v_random 為負數。
--       負數 < trigger_rate (0.01) 永遠成立 → 實際觸發率 ~50% 而非設定的 1%
--
-- 修法：加 2^63 偏移後除以 2^64，讓結果恆落在 [0, 1)
--       v_random := (signed_bigint + 2^63) / 2^64
--
-- 此 migration 僅更新函數定義，無 schema 變更

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
  v_new_tokens          INT;
  v_rush_hits_remaining INT;
  v_spins_this_tier     INT;
  v_new_tier_progress   JSONB;
  v_state               TEXT;
  v_updated             INT;
  v_actual_bet          BIGINT;
  v_locked_bet_out      INT;
  v_seed                TEXT;
  v_nonce               INT;
  v_hash                TEXT;
  v_random              NUMERIC;
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

  v_seed   := md5(p_machine_id::TEXT || v_user_id::TEXT
                  || clock_timestamp()::TEXT || gen_random_uuid()::TEXT);
  v_nonce  := floor(random() * 1000000)::INT;
  v_hash   := encode(digest((v_seed || v_nonce::TEXT)::BYTEA, 'sha256'), 'hex');

  -- BIT(64)::BIGINT 是 signed；加 2^63 偏移讓結果變成 unsigned [0, 2^64)，再除以 2^64
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

  v_in_rush := (v_session.state = 'rush' AND v_session.rush_hits_remaining > 0);

  IF v_in_rush AND v_session.locked_bet IS NOT NULL THEN
    v_actual_bet := v_session.locked_bet;
  ELSE
    v_actual_bet := p_bet;
  END IF;

  v_spins_this_tier := COALESCE(
    (COALESCE(v_session.tier_progress, '{}'::jsonb) ->> v_actual_bet::text)::int,
    0
  );

  UPDATE public.users
  SET tokens = tokens - v_actual_bet
  WHERE id = v_user_id AND tokens >= v_actual_bet
  RETURNING tokens INTO v_new_tokens;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient token balance';
  END IF;

  IF NOT v_in_rush THEN
    IF v_spins_this_tier >= v_machine.floor_spin_count THEN
      v_in_rush        := TRUE;
      v_rush_triggered := TRUE;
      v_is_ceiling     := TRUE;
    ELSIF v_random < v_machine.trigger_rate THEN
      v_in_rush        := TRUE;
      v_rush_triggered := TRUE;
    END IF;

    IF v_rush_triggered THEN
      v_rush_hits_remaining := v_machine.min_rush_hits;
    END IF;
  END IF;

  IF v_in_rush THEN
    SELECT spi.id, spi.product_prize_id, spi.slot_prize_id,
           spi.weight, spi.is_floor, spi.remaining,
           COALESCE(spi.coin_return, false)                 AS coin_return,
           spi.return_multiplier, spi.display_name,
           COALESCE(spi.display_name, pp.name, sp.name)    AS prize_name,
           COALESCE(pp.level, sp.level)                     AS prize_level,
           COALESCE(pp.image_url, sp.image_url)             AS prize_image_url,
           pp.product_id,
           COALESCE(pp.recycle_value, 0)                    AS recycle_value
    INTO v_pool_item
    FROM public.slot_pool_items spi
    LEFT JOIN public.product_prizes pp ON pp.id = spi.product_prize_id
    LEFT JOIN public.slot_prizes    sp ON sp.id = spi.slot_prize_id
    WHERE spi.machine_id  = p_machine_id
      AND spi.normal_only = FALSE
      AND COALESCE(spi.coin_return, false) = FALSE
      AND (spi.remaining  IS NULL OR spi.remaining > 0)
      AND (spi.min_bet    IS NULL OR spi.min_bet <= v_actual_bet)
    ORDER BY RANDOM() ^ (1.0 / spi.weight) DESC
    LIMIT 1;

  ELSE
    SELECT spi.id, spi.product_prize_id, spi.slot_prize_id,
           spi.weight, spi.is_floor, spi.remaining,
           COALESCE(spi.coin_return, false)                 AS coin_return,
           spi.return_multiplier, spi.display_name,
           COALESCE(spi.display_name, pp.name, sp.name)    AS prize_name,
           COALESCE(pp.level, sp.level)                     AS prize_level,
           COALESCE(pp.image_url, sp.image_url)             AS prize_image_url,
           pp.product_id,
           COALESCE(pp.recycle_value, 0)                    AS recycle_value
    INTO v_pool_item
    FROM public.slot_pool_items spi
    LEFT JOIN public.product_prizes pp ON pp.id = spi.product_prize_id
    LEFT JOIN public.slot_prizes    sp ON sp.id = spi.slot_prize_id
    WHERE spi.machine_id = p_machine_id
      AND spi.is_floor   = FALSE
      AND spi.rush_only  = FALSE
      AND (spi.remaining IS NULL OR spi.remaining > 0)
      AND (spi.min_bet   IS NULL OR spi.min_bet <= v_actual_bet)
    ORDER BY RANDOM() ^ (1.0 / spi.weight) DESC
    LIMIT 1;
  END IF;

  IF v_pool_item IS NULL AND NOT v_in_rush THEN
    SELECT spi.id, spi.product_prize_id, spi.slot_prize_id,
           spi.weight, spi.is_floor, spi.remaining,
           COALESCE(spi.coin_return, false)                 AS coin_return,
           spi.return_multiplier, spi.display_name,
           COALESCE(spi.display_name, pp.name, sp.name)    AS prize_name,
           COALESCE(pp.level, sp.level)                     AS prize_level,
           COALESCE(pp.image_url, sp.image_url)             AS prize_image_url,
           pp.product_id,
           COALESCE(pp.recycle_value, 0)                    AS recycle_value
    INTO v_pool_item
    FROM public.slot_pool_items spi
    LEFT JOIN public.product_prizes pp ON pp.id = spi.product_prize_id
    LEFT JOIN public.slot_prizes    sp ON sp.id = spi.slot_prize_id
    WHERE spi.machine_id = p_machine_id AND spi.is_floor = TRUE
    LIMIT 1;
  END IF;

  IF v_pool_item IS NULL THEN
    RAISE EXCEPTION 'No prizes configured for this machine';
  END IF;

  IF v_pool_item.coin_return THEN
    v_is_coin_return     := TRUE;
    v_coin_return_amount := floor(v_actual_bet * COALESCE(v_pool_item.return_multiplier, 0))::BIGINT;

    UPDATE public.users
    SET tokens = tokens + v_coin_return_amount
    WHERE id = v_user_id
    RETURNING tokens INTO v_new_tokens;

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

  ELSE
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

  END IF;

  IF v_in_rush THEN
    v_rush_hits_remaining := COALESCE(v_rush_hits_remaining, v_session.rush_hits_remaining) - 1;

    IF v_rush_hits_remaining <= 0 THEN
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
  ELSE
    v_rush_hits_remaining := 0;
    v_state               := 'normal';
  END IF;

  IF v_rush_triggered THEN
    v_new_tier_progress := jsonb_set(
      COALESCE(v_session.tier_progress, '{}'::jsonb),
      ARRAY[v_actual_bet::text], '0'::jsonb
    );
  ELSIF NOT v_in_rush THEN
    v_new_tier_progress := jsonb_set(
      COALESCE(v_session.tier_progress, '{}'::jsonb),
      ARRAY[v_actual_bet::text],
      to_jsonb(v_spins_this_tier + 1)
    );
  ELSE
    v_new_tier_progress := COALESCE(v_session.tier_progress, '{}'::jsonb);
  END IF;

  v_locked_bet_out := CASE
    WHEN v_rush_triggered THEN v_actual_bet::INT
    WHEN v_state = 'rush'  THEN v_session.locked_bet
    ELSE                        NULL
  END;

  UPDATE public.slot_sessions SET
    state               = v_state,
    rush_hits_remaining = v_rush_hits_remaining,
    spins_since_rush    = COALESCE((v_new_tier_progress ->> v_actual_bet::text)::int, 0),
    tier_progress       = v_new_tier_progress,
    total_spins         = total_spins + 1,
    locked_bet          = v_locked_bet_out,
    updated_at          = NOW()
  WHERE user_id = v_user_id AND machine_id = p_machine_id;

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
      'spins_since_rush',    COALESCE((v_new_tier_progress ->> v_actual_bet::text)::int, 0),
      'tier_progress',       v_new_tier_progress,
      'total_spins',         v_session.total_spins + 1,
      'locked_bet',          v_locked_bet_out
    ),
    'rush_triggered', v_rush_triggered,
    'is_ceiling',     v_is_ceiling
  );
END;
$function$;
