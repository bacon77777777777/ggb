-- Migration 278: 修復任務追蹤三個問題
-- 1. user_task_progress 加入 metadata 欄位（view_product 去重用）
-- 2. track_mission_event login 事件需追蹤 condition_type='login' 任務
-- 3. period_key 改用台灣時區（Asia/Taipei）

-- 1. 加 metadata 欄位
ALTER TABLE public.user_task_progress
  ADD COLUMN IF NOT EXISTS metadata jsonb;

-- 2 + 3. 重新部署 track_mission_event，修正 login handler 和 timezone
CREATE OR REPLACE FUNCTION public.track_mission_event(
  p_event_type TEXT,
  p_data JSONB DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id     UUID;
  v_task        RECORD;
  v_period_key  TEXT;
  v_meta        JSONB;
  v_item_id     TEXT;
  v_increment   INT;
  v_last_date   DATE;
  v_streak      INT;
  v_total       NUMERIC;
  v_amount      INT;
  v_day_draws   INT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Not authenticated');
  END IF;

  -- ── LOGIN ──────────────────────────────────────────────────────────────────
  IF p_event_type = 'login' THEN
    SELECT last_login_date, login_streak INTO v_last_date, v_streak
    FROM public.users WHERE id = v_user_id;

    IF v_last_date = CURRENT_DATE THEN
      -- already tracked today, no-op
      NULL;
    ELSIF v_last_date = CURRENT_DATE - 1 THEN
      v_streak := COALESCE(v_streak, 0) + 1;
      UPDATE public.users SET login_streak = v_streak, last_login_date = CURRENT_DATE WHERE id = v_user_id;
    ELSE
      v_streak := 1;
      UPDATE public.users SET login_streak = 1, last_login_date = CURRENT_DATE WHERE id = v_user_id;
    END IF;

    -- Update login_streak achievement tasks
    FOR v_task IN SELECT * FROM public.tasks WHERE condition_type = 'login_streak' AND is_active = true LOOP
      INSERT INTO public.user_task_progress (user_id, task_id, progress, period_key)
      VALUES (v_user_id, v_task.id, v_streak, 'ALL')
      ON CONFLICT (user_id, task_id, period_key)
      DO UPDATE SET progress = GREATEST(user_task_progress.progress, v_streak), last_updated = NOW();

      UPDATE public.user_task_progress SET is_completed = true
      WHERE user_id = v_user_id AND task_id = v_task.id AND period_key = 'ALL'
        AND progress >= v_task.target_value AND is_completed = false;
    END LOOP;

    -- Also update daily/weekly 'login' condition tasks (was missing before)
    IF v_last_date IS DISTINCT FROM CURRENT_DATE THEN
      FOR v_task IN SELECT * FROM public.tasks WHERE condition_type = 'login' AND is_active = true LOOP
        IF v_task.type = 'daily' THEN
          v_period_key := to_char(NOW() AT TIME ZONE 'Asia/Taipei', 'YYYY-MM-DD');
          INSERT INTO public.user_task_progress (user_id, task_id, progress, period_key)
          VALUES (v_user_id, v_task.id, 1, v_period_key)
          ON CONFLICT (user_id, task_id, period_key) DO NOTHING;
        ELSIF v_task.type = 'weekly' THEN
          v_period_key := to_char(NOW() AT TIME ZONE 'Asia/Taipei', 'IYYY-IW');
          INSERT INTO public.user_task_progress (user_id, task_id, progress, period_key)
          VALUES (v_user_id, v_task.id, 1, v_period_key)
          ON CONFLICT (user_id, task_id, period_key)
          DO UPDATE SET
            progress = LEAST(user_task_progress.progress + 1, v_task.target_value),
            last_updated = NOW();
        END IF;
        -- Mark completed
        IF v_task.type IN ('daily', 'weekly') THEN
          UPDATE public.user_task_progress SET is_completed = true
          WHERE user_id = v_user_id AND task_id = v_task.id AND period_key = v_period_key
            AND progress >= v_task.target_value AND is_completed = false;
        END IF;
      END LOOP;
    END IF;

    RETURN jsonb_build_object('success', true, 'login_streak', v_streak);
  END IF;

  -- ── DRAW_COUNT ─────────────────────────────────────────────────────────────
  IF p_event_type = 'draw_count' THEN
    v_amount := GREATEST(1, COALESCE((p_data->>'count')::INT, 1));

    SELECT last_draw_date, draw_streak INTO v_last_date, v_streak
    FROM public.users WHERE id = v_user_id;

    IF v_last_date = CURRENT_DATE THEN
      UPDATE public.users SET total_draws = COALESCE(total_draws, 0) + v_amount WHERE id = v_user_id;
    ELSIF v_last_date = CURRENT_DATE - 1 THEN
      v_streak := COALESCE(v_streak, 0) + 1;
      UPDATE public.users SET
        total_draws = COALESCE(total_draws, 0) + v_amount,
        draw_streak = v_streak,
        last_draw_date = CURRENT_DATE
      WHERE id = v_user_id;
    ELSE
      v_streak := 1;
      UPDATE public.users SET
        total_draws = COALESCE(total_draws, 0) + v_amount,
        draw_streak = 1,
        last_draw_date = CURRENT_DATE
      WHERE id = v_user_id;
    END IF;

    FOR v_task IN SELECT * FROM public.tasks WHERE condition_type = 'draw_streak' AND is_active = true LOOP
      INSERT INTO public.user_task_progress (user_id, task_id, progress, period_key)
      VALUES (v_user_id, v_task.id, v_streak, 'ALL')
      ON CONFLICT (user_id, task_id, period_key)
      DO UPDATE SET progress = GREATEST(user_task_progress.progress, v_streak), last_updated = NOW();

      UPDATE public.user_task_progress SET is_completed = true
      WHERE user_id = v_user_id AND task_id = v_task.id AND period_key = 'ALL'
        AND progress >= v_task.target_value AND is_completed = false;
    END LOOP;

    SELECT COUNT(*) INTO v_day_draws FROM public.draw_records
    WHERE user_id = v_user_id
      AND created_at >= date_trunc('day', NOW() AT TIME ZONE 'Asia/Taipei') AT TIME ZONE 'Asia/Taipei';

    FOR v_task IN SELECT * FROM public.tasks WHERE condition_type = 'single_day_draws' AND is_active = true LOOP
      INSERT INTO public.user_task_progress (user_id, task_id, progress, period_key)
      VALUES (v_user_id, v_task.id, v_day_draws, 'ALL')
      ON CONFLICT (user_id, task_id, period_key)
      DO UPDATE SET progress = GREATEST(user_task_progress.progress, v_day_draws), last_updated = NOW();

      UPDATE public.user_task_progress SET is_completed = true
      WHERE user_id = v_user_id AND task_id = v_task.id AND period_key = 'ALL'
        AND progress >= v_task.target_value AND is_completed = false;
    END LOOP;
  END IF;

  -- ── RECHARGE / RECHARGE_AMOUNT ─────────────────────────────────────────────
  IF p_event_type IN ('recharge', 'recharge_amount') THEN
    v_amount := GREATEST(0, COALESCE((p_data->>'amount')::INT, 0));

    SELECT last_topup_date, topup_streak, total_topup INTO v_last_date, v_streak, v_total
    FROM public.users WHERE id = v_user_id;

    IF v_last_date = CURRENT_DATE THEN
      IF v_amount > 0 THEN
        UPDATE public.users SET total_topup = COALESCE(total_topup, 0) + v_amount WHERE id = v_user_id;
      END IF;
    ELSIF v_last_date = CURRENT_DATE - 1 THEN
      v_streak := COALESCE(v_streak, 0) + 1;
      UPDATE public.users SET
        total_topup   = COALESCE(total_topup, 0) + v_amount,
        topup_streak  = v_streak,
        last_topup_date = CURRENT_DATE
      WHERE id = v_user_id;

      FOR v_task IN SELECT * FROM public.tasks WHERE condition_type = 'topup_streak' AND is_active = true LOOP
        INSERT INTO public.user_task_progress (user_id, task_id, progress, period_key)
        VALUES (v_user_id, v_task.id, v_streak, 'ALL')
        ON CONFLICT (user_id, task_id, period_key)
        DO UPDATE SET progress = GREATEST(user_task_progress.progress, v_streak), last_updated = NOW();

        UPDATE public.user_task_progress SET is_completed = true
        WHERE user_id = v_user_id AND task_id = v_task.id AND period_key = 'ALL'
          AND progress >= v_task.target_value AND is_completed = false;
      END LOOP;
    ELSE
      v_streak := 1;
      UPDATE public.users SET
        total_topup   = COALESCE(total_topup, 0) + v_amount,
        topup_streak  = 1,
        last_topup_date = CURRENT_DATE
      WHERE id = v_user_id;

      FOR v_task IN SELECT * FROM public.tasks WHERE condition_type = 'topup_streak' AND is_active = true LOOP
        INSERT INTO public.user_task_progress (user_id, task_id, progress, period_key)
        VALUES (v_user_id, v_task.id, v_streak, 'ALL')
        ON CONFLICT (user_id, task_id, period_key)
        DO UPDATE SET progress = GREATEST(user_task_progress.progress, v_streak), last_updated = NOW();

        UPDATE public.user_task_progress SET is_completed = true
        WHERE user_id = v_user_id AND task_id = v_task.id AND period_key = 'ALL'
          AND progress >= v_task.target_value AND is_completed = false;
      END LOOP;
    END IF;

    -- total recharge amount
    SELECT COALESCE(total_topup, 0) INTO v_total FROM public.users WHERE id = v_user_id;
    FOR v_task IN SELECT * FROM public.tasks WHERE condition_type = 'recharge_amount' AND is_active = true LOOP
      INSERT INTO public.user_task_progress (user_id, task_id, progress, period_key)
      VALUES (v_user_id, v_task.id, v_total::INT, 'ALL')
      ON CONFLICT (user_id, task_id, period_key)
      DO UPDATE SET progress = GREATEST(user_task_progress.progress, v_total::INT), last_updated = NOW();

      UPDATE public.user_task_progress SET is_completed = true
      WHERE user_id = v_user_id AND task_id = v_task.id AND period_key = 'ALL'
        AND progress >= v_task.target_value AND is_completed = false;
    END LOOP;
  END IF;

  -- ── INVITE_FRIEND ──────────────────────────────────────────────────────────
  IF p_event_type = 'invite_friend' THEN
    UPDATE public.users SET total_referrals = COALESCE(total_referrals, 0) + 1 WHERE id = v_user_id;
    SELECT total_referrals INTO v_streak FROM public.users WHERE id = v_user_id;

    FOR v_task IN SELECT * FROM public.tasks WHERE condition_type = 'invite_friend' AND is_active = true LOOP
      INSERT INTO public.user_task_progress (user_id, task_id, progress, period_key)
      VALUES (v_user_id, v_task.id, v_streak, 'ALL')
      ON CONFLICT (user_id, task_id, period_key)
      DO UPDATE SET progress = GREATEST(user_task_progress.progress, v_streak), last_updated = NOW();

      UPDATE public.user_task_progress SET is_completed = true
      WHERE user_id = v_user_id AND task_id = v_task.id AND period_key = 'ALL'
        AND progress >= v_task.target_value AND is_completed = false;
    END LOOP;
  END IF;

  -- ── MAIN LOOP for remaining event types ────────────────────────────────────
  -- Handles: draw_count, view_product, view_winning_records, like_ranking,
  --          share_app, spend_amount, spend_points, recharge, and any others
  FOR v_task IN
    SELECT * FROM public.tasks
    WHERE condition_type = p_event_type AND is_active = true
  LOOP
    IF v_task.type = 'daily' THEN
      v_period_key := to_char(NOW() AT TIME ZONE 'Asia/Taipei', 'YYYY-MM-DD');
    ELSIF v_task.type = 'weekly' THEN
      v_period_key := to_char(NOW() AT TIME ZONE 'Asia/Taipei', 'IYYY-IW');
    ELSE
      v_period_key := 'ALL';
    END IF;

    IF p_event_type IN ('spend_amount', 'recharge_amount', 'spend_points') THEN
      v_increment := GREATEST(1, COALESCE((p_data->>'amount')::INT, 1));
    ELSIF p_event_type = 'draw_count' THEN
      v_increment := GREATEST(1, COALESCE((p_data->>'count')::INT, 1));
    ELSE
      v_increment := 1;
    END IF;

    IF p_event_type = 'view_product' THEN
      v_item_id := p_data->>'product_id';
      SELECT metadata INTO v_meta FROM public.user_task_progress
      WHERE user_id = v_user_id AND task_id = v_task.id AND period_key = v_period_key;
      IF NOT FOUND THEN v_meta := '{"viewed_ids": []}'::jsonb;
      ELSIF v_meta IS NULL THEN v_meta := '{"viewed_ids": []}'::jsonb;
      END IF;
      IF v_meta->'viewed_ids' ? v_item_id THEN CONTINUE; END IF;
      IF NOT (v_meta ? 'viewed_ids') THEN v_meta := jsonb_set(v_meta, '{viewed_ids}', '[]'::jsonb); END IF;
      v_meta := jsonb_set(v_meta, '{viewed_ids}', (v_meta->'viewed_ids') || to_jsonb(v_item_id));
      INSERT INTO public.user_task_progress (user_id, task_id, progress, period_key, metadata)
      VALUES (v_user_id, v_task.id, 1, v_period_key, v_meta)
      ON CONFLICT (user_id, task_id, period_key) DO UPDATE SET
        progress = user_task_progress.progress + 1,
        metadata = EXCLUDED.metadata,
        last_updated = NOW();
    ELSE
      INSERT INTO public.user_task_progress (user_id, task_id, progress, period_key)
      VALUES (v_user_id, v_task.id, v_increment, v_period_key)
      ON CONFLICT (user_id, task_id, period_key) DO UPDATE SET
        progress = user_task_progress.progress + v_increment,
        last_updated = NOW();
    END IF;

    UPDATE public.user_task_progress SET is_completed = true
    WHERE user_id = v_user_id AND task_id = v_task.id AND period_key = v_period_key
      AND progress >= v_task.target_value AND is_completed = false;
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 3. Fix get_user_missions to use Taiwan timezone
CREATE OR REPLACE FUNCTION public.get_user_missions()
RETURNS TABLE (
  id             uuid,
  type           text,
  title          text,
  description    text,
  target_value   integer,
  reward_coins   integer,
  condition_type text,
  icon_name      text,
  progress       integer,
  is_completed   boolean,
  is_claimed     boolean,
  period_key     text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_today   TEXT;
  v_week    TEXT;
BEGIN
  v_user_id := auth.uid();
  v_today   := to_char(NOW() AT TIME ZONE 'Asia/Taipei', 'YYYY-MM-DD');
  v_week    := to_char(NOW() AT TIME ZONE 'Asia/Taipei', 'IYYY-IW');

  RETURN QUERY
  SELECT
    t.id,
    t.type,
    t.title,
    t.description,
    t.target_value,
    t.reward_coins,
    t.condition_type,
    t.icon_name,
    COALESCE(utp.progress, 0)         AS progress,
    COALESCE(utp.is_completed, false)  AS is_completed,
    COALESCE(utp.is_claimed, false)    AS is_claimed,
    COALESCE(utp.period_key,
      CASE
        WHEN t.type = 'daily'       THEN v_today
        WHEN t.type = 'weekly'      THEN v_week
        ELSE 'ALL'
      END
    ) AS period_key
  FROM public.tasks t
  LEFT JOIN public.user_task_progress utp
    ON utp.task_id = t.id
   AND utp.user_id = v_user_id
   AND (
         (t.type = 'daily'       AND utp.period_key = v_today) OR
         (t.type = 'weekly'      AND utp.period_key = v_week)  OR
         (t.type = 'achievement' AND utp.period_key = 'ALL')
       )
  WHERE t.is_active = TRUE
  ORDER BY
    CASE WHEN COALESCE(utp.is_claimed,   false) THEN 2 ELSE 0 END,
    CASE WHEN COALESCE(utp.is_completed, false) THEN 0 ELSE 1 END,
    t.type,
    t.sort_order ASC;
END;
$$;

-- 4. 停用「查看中獎紀錄」任務（用戶要求替換，暫時停用）
UPDATE public.tasks
SET is_active = false
WHERE condition_type = 'view_winning_records';
