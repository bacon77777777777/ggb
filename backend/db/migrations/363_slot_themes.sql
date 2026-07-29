-- 363_slot_themes.sql
-- 主題制挑戰機台全面改造
-- 1. slot_themes 主題表
-- 2. slot_theme_prizes RUSH獎池模板
-- 3. slot_machines 加 theme_id / machine_number / spin_returns
-- 4. slot_pool_items 加 coin_return / return_multiplier / display_name
-- 5. 更新 play_slot_locked RPC 支援 coin_return 品項
-- 6. 把現有 3 台機器遷移到一個主題

-- ════════════════════════════════════════
-- 1. slot_themes
-- ════════════════════════════════════════

CREATE TABLE IF NOT EXISTS slot_themes (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name            TEXT    NOT NULL,
  machine_count   INT     NOT NULL DEFAULT 1,
  event_slug      TEXT,
  supplier_id     BIGINT  REFERENCES suppliers(id),
  image_url       TEXT,
  bet_tiers       JSONB   NOT NULL DEFAULT '[]',
  spin_returns    JSONB   NOT NULL DEFAULT '[
    {"name":"強レア",    "multiplier":5,   "weight":50},
    {"name":"チャンス目","multiplier":3,   "weight":100},
    {"name":"チェリー",  "multiplier":2,   "weight":200},
    {"name":"ベル",      "multiplier":1.3, "weight":500},
    {"name":"ハズレ",    "multiplier":0.05,"weight":1150}
  ]',
  trigger_rate    NUMERIC NOT NULL DEFAULT 0.003,
  continue_rate   NUMERIC NOT NULL DEFAULT 0.80,
  min_rush_hits   INT     NOT NULL DEFAULT 1,
  floor_spin_count INT    NOT NULL DEFAULT 302,
  video_rush_entry        TEXT,
  video_rush_anticipation TEXT,
  video_rush_win          TEXT,
  video_rush_win_strong   TEXT,
  video_rush_win_god      TEXT,
  video_rush_revival      TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT false,
  sort_order      INT     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ════════════════════════════════════════
-- 2. slot_theme_prizes（RUSH 獎池模板）
-- ════════════════════════════════════════

CREATE TABLE IF NOT EXISTS slot_theme_prizes (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  theme_id          BIGINT NOT NULL REFERENCES slot_themes(id) ON DELETE CASCADE,
  name              TEXT   NOT NULL,
  image_url         TEXT,
  weight            INT    NOT NULL DEFAULT 100,
  video_type        TEXT   NOT NULL DEFAULT 'win'
                    CHECK (video_type IN ('win','win_strong','win_god')),
  per_machine_stock INT,   -- NULL = 不限
  sort_order        INT    NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ════════════════════════════════════════
-- 3. 修改 slot_machines
-- ════════════════════════════════════════

ALTER TABLE slot_machines
  ADD COLUMN IF NOT EXISTS theme_id       BIGINT REFERENCES slot_themes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS machine_number INT,
  ADD COLUMN IF NOT EXISTS spin_returns   JSONB DEFAULT '[]';

-- ════════════════════════════════════════
-- 4. 修改 slot_pool_items
-- ════════════════════════════════════════

ALTER TABLE slot_pool_items
  ADD COLUMN IF NOT EXISTS coin_return       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS return_multiplier NUMERIC,
  ADD COLUMN IF NOT EXISTS display_name      TEXT;

-- ════════════════════════════════════════
-- 5. Indexes
-- ════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_slot_machines_theme_id    ON slot_machines(theme_id);
CREATE INDEX IF NOT EXISTS idx_slot_theme_prizes_theme_id ON slot_theme_prizes(theme_id);

-- ════════════════════════════════════════
-- 6. 遷移現有 3 台機器
-- ════════════════════════════════════════

DO $$
DECLARE
  v_theme_id BIGINT;
BEGIN
  IF EXISTS (SELECT 1 FROM slot_machines WHERE id = 1) THEN
    INSERT INTO slot_themes (
      name, machine_count, supplier_id, bet_tiers,
      trigger_rate, continue_rate, min_rush_hits, floor_spin_count,
      is_active, sort_order
    )
    SELECT
      COALESCE(machine_theme, '絕頂RUSH'),
      3,
      supplier_id,
      COALESCE(bet_tiers, '[]'::jsonb),
      trigger_rate, continue_rate, min_rush_hits, floor_spin_count,
      is_active, 0
    FROM slot_machines WHERE id = 1
    RETURNING id INTO v_theme_id;

    UPDATE slot_machines
    SET theme_id       = v_theme_id,
        machine_number = id
    WHERE id IN (1, 2, 3);
  END IF;
END;
$$;

-- ════════════════════════════════════════
-- 7. 更新 play_slot_locked RPC
-- ════════════════════════════════════════

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
  v_is_floor            BOOL    := FALSE;
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
  v_random := (('x' || substring(v_hash, 1, 16))::BIT(64)::BIGINT)::NUMERIC
              / 18446744073709551615.0;

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
      v_is_floor       := TRUE;
    ELSIF v_random < v_machine.trigger_rate THEN
      v_in_rush        := TRUE;
      v_rush_triggered := TRUE;
    END IF;

    IF v_rush_triggered THEN
      v_rush_hits_remaining := v_machine.min_rush_hits;
    END IF;
  END IF;

  -- ── Prize selection ──────────────────────────────────────────────────────

  IF v_is_floor THEN
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

  ELSIF v_in_rush THEN
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
      AND spi.is_floor    = FALSE
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

  -- Fallback to floor prize if pool is empty
  IF v_pool_item IS NULL AND NOT v_is_floor THEN
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
    v_is_floor := TRUE;
  END IF;

  IF v_pool_item IS NULL THEN
    RAISE EXCEPTION 'No prizes configured for this machine';
  END IF;

  -- ── Coin return handling ────────────────────────────────────────────────

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
    -- ── 標準品項：扣庫存 ──────────────────────────────────────────────────

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

  -- ── Session state update ────────────────────────────────────────────────

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
    'is_floor',       v_is_floor
  );
END;
$function$;
