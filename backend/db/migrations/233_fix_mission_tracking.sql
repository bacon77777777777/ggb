-- Fix mission tracking: handle login_streak, draw_streak, topup_streak, total_draws, total_topup
-- Also update users stats columns which check_achievements reads from.

CREATE OR REPLACE FUNCTION public.track_mission_event(
  p_event_type text,
  p_data jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_user_id     UUID;
  v_task        RECORD;
  v_period_key  TEXT;
  v_meta        JSONB;
  v_item_id     TEXT;
  v_increment   INT;
  -- streak/stats vars
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

  -- ── LOGIN: update login_streak in users, then track login_streak tasks ──
  IF p_event_type = 'login' THEN
    SELECT last_login_date, login_streak INTO v_last_date, v_streak
    FROM public.users WHERE id = v_user_id;

    IF v_last_date = CURRENT_DATE THEN
      -- already tracked today, no-op
    ELSIF v_last_date = CURRENT_DATE - 1 THEN
      v_streak := COALESCE(v_streak, 0) + 1;
      UPDATE public.users SET login_streak = v_streak, last_login_date = CURRENT_DATE WHERE id = v_user_id;
    ELSE
      v_streak := 1;
      UPDATE public.users SET login_streak = 1, last_login_date = CURRENT_DATE WHERE id = v_user_id;
    END IF;

    -- Update login_streak task progress (SET to current streak, use GREATEST to never go backwards)
    FOR v_task IN SELECT * FROM public.tasks WHERE condition_type = 'login_streak' AND is_active = true LOOP
      INSERT INTO public.user_task_progress (user_id, task_id, progress, period_key)
      VALUES (v_user_id, v_task.id, v_streak, 'ALL')
      ON CONFLICT (user_id, task_id, period_key)
      DO UPDATE SET progress = GREATEST(user_task_progress.progress, v_streak), last_updated = NOW();

      UPDATE public.user_task_progress SET is_completed = true
      WHERE user_id = v_user_id AND task_id = v_task.id AND period_key = 'ALL'
        AND progress >= v_task.target_value AND is_completed = false;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'login_streak', v_streak);
  END IF;

  -- ── DRAW_COUNT: update total_draws + draw_streak in users, track related tasks ──
  IF p_event_type = 'draw_count' THEN
    v_amount := GREATEST(1, COALESCE((p_data->>'count')::INT, 1));

    SELECT last_draw_date, draw_streak INTO v_last_date, v_streak
    FROM public.users WHERE id = v_user_id;

    IF v_last_date = CURRENT_DATE THEN
      -- already drew today, streak unchanged; just increment total_draws
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

    -- draw_streak tasks: SET to current streak
    FOR v_task IN SELECT * FROM public.tasks WHERE condition_type = 'draw_streak' AND is_active = true LOOP
      INSERT INTO public.user_task_progress (user_id, task_id, progress, period_key)
      VALUES (v_user_id, v_task.id, v_streak, 'ALL')
      ON CONFLICT (user_id, task_id, period_key)
      DO UPDATE SET progress = GREATEST(user_task_progress.progress, v_streak), last_updated = NOW();

      UPDATE public.user_task_progress SET is_completed = true
      WHERE user_id = v_user_id AND task_id = v_task.id AND period_key = 'ALL'
        AND progress >= v_task.target_value AND is_completed = false;
    END LOOP;

    -- single_day_draws tasks: count today's draws from draw_records
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

  -- ── RECHARGE / RECHARGE_AMOUNT: update total_topup + topup_streak ──
  IF p_event_type IN ('recharge', 'recharge_amount') THEN
    v_amount := GREATEST(0, COALESCE((p_data->>'amount')::INT, 0));

    SELECT last_topup_date, topup_streak, total_topup INTO v_last_date, v_streak, v_total
    FROM public.users WHERE id = v_user_id;

    IF v_last_date = CURRENT_DATE THEN
      -- already topped up today: just add amount
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

      -- topup_streak tasks: SET to current streak
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
        VALUES (v_user_id, v_task.id, 1, 'ALL')
        ON CONFLICT (user_id, task_id, period_key)
        DO UPDATE SET progress = GREATEST(user_task_progress.progress, 1), last_updated = NOW();

        UPDATE public.user_task_progress SET is_completed = true
        WHERE user_id = v_user_id AND task_id = v_task.id AND period_key = 'ALL'
          AND progress >= v_task.target_value AND is_completed = false;
      END LOOP;
    END IF;
  END IF;

  -- ── INVITE_FRIEND: update total_referrals ──
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

  -- ── General task tracking (original logic, handles all other condition types) ──
  FOR v_task IN
    SELECT * FROM public.tasks
    WHERE condition_type = p_event_type AND is_active = true
  LOOP
    IF v_task.type = 'daily' THEN
      v_period_key := to_char(NOW(), 'YYYY-MM-DD');
    ELSIF v_task.type = 'weekly' THEN
      v_period_key := to_char(NOW(), 'IYYY-IW');
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
$function$;
