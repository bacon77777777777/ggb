-- Migration 310: 新增 track_mission_event_for_user（後台/webhook 用，接受明確 user_id）
-- 用途：ECPay callback 確認儲值後，由 service_role 呼叫，記錄 recharge/recharge_amount 任務進度

CREATE OR REPLACE FUNCTION public.track_mission_event_for_user(
  p_user_id   UUID,
  p_event_type TEXT,
  p_data       JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_task        RECORD;
  v_period_key  TEXT;
  v_increment   INT;
  v_total       NUMERIC;
  v_last_date   DATE;
  v_streak      INT;
  v_amount      INT;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'user_id required');
  END IF;

  -- ── RECHARGE / RECHARGE_AMOUNT ─────────────────────────────────────────────
  IF p_event_type IN ('recharge', 'recharge_amount') THEN
    v_amount := GREATEST(0, COALESCE((p_data->>'amount')::INT, 0));

    SELECT last_topup_date, topup_streak, total_topup INTO v_last_date, v_streak, v_total
    FROM public.users WHERE id = p_user_id;

    IF v_last_date = CURRENT_DATE THEN
      IF v_amount > 0 THEN
        UPDATE public.users SET total_topup = COALESCE(total_topup, 0) + v_amount WHERE id = p_user_id;
      END IF;
    ELSIF v_last_date = CURRENT_DATE - 1 THEN
      v_streak := COALESCE(v_streak, 0) + 1;
      UPDATE public.users SET
        total_topup     = COALESCE(total_topup, 0) + v_amount,
        topup_streak    = v_streak,
        last_topup_date = CURRENT_DATE
      WHERE id = p_user_id;

      FOR v_task IN SELECT * FROM public.tasks WHERE condition_type = 'topup_streak' AND is_active = true LOOP
        INSERT INTO public.user_task_progress (user_id, task_id, progress, period_key)
        VALUES (p_user_id, v_task.id, v_streak, 'ALL')
        ON CONFLICT (user_id, task_id, period_key)
        DO UPDATE SET progress = GREATEST(user_task_progress.progress, v_streak), last_updated = NOW();

        UPDATE public.user_task_progress SET is_completed = true
        WHERE user_id = p_user_id AND task_id = v_task.id AND period_key = 'ALL'
          AND progress >= v_task.target_value AND is_completed = false;
      END LOOP;
    ELSE
      v_streak := 1;
      UPDATE public.users SET
        total_topup     = COALESCE(total_topup, 0) + v_amount,
        topup_streak    = 1,
        last_topup_date = CURRENT_DATE
      WHERE id = p_user_id;

      FOR v_task IN SELECT * FROM public.tasks WHERE condition_type = 'topup_streak' AND is_active = true LOOP
        INSERT INTO public.user_task_progress (user_id, task_id, progress, period_key)
        VALUES (p_user_id, v_task.id, 1, 'ALL')
        ON CONFLICT (user_id, task_id, period_key)
        DO UPDATE SET progress = GREATEST(user_task_progress.progress, 1), last_updated = NOW();
      END LOOP;
    END IF;

    -- 今日首次儲值（condition_type = 'recharge'）
    FOR v_task IN SELECT * FROM public.tasks WHERE condition_type = 'recharge' AND is_active = true LOOP
      IF v_task.type = 'daily' THEN
        v_period_key := to_char(NOW() AT TIME ZONE 'Asia/Taipei', 'YYYY-MM-DD');
      ELSIF v_task.type = 'weekly' THEN
        v_period_key := to_char(NOW() AT TIME ZONE 'Asia/Taipei', 'IYYY-IW');
      ELSE
        v_period_key := 'ALL';
      END IF;
      INSERT INTO public.user_task_progress (user_id, task_id, progress, period_key)
      VALUES (p_user_id, v_task.id, 1, v_period_key)
      ON CONFLICT (user_id, task_id, period_key) DO NOTHING; -- 只記第一次

      UPDATE public.user_task_progress SET is_completed = true
      WHERE user_id = p_user_id AND task_id = v_task.id AND period_key = v_period_key
        AND progress >= v_task.target_value AND is_completed = false;
    END LOOP;

    -- 累積儲值代幣（condition_type = 'recharge_amount'），按週累積
    IF v_amount > 0 THEN
      FOR v_task IN SELECT * FROM public.tasks WHERE condition_type = 'recharge_amount' AND is_active = true LOOP
        IF v_task.type = 'weekly' THEN
          v_period_key := to_char(NOW() AT TIME ZONE 'Asia/Taipei', 'IYYY-IW');
        ELSE
          v_period_key := 'ALL';
        END IF;

        INSERT INTO public.user_task_progress (user_id, task_id, progress, period_key)
        VALUES (p_user_id, v_task.id, v_amount, v_period_key)
        ON CONFLICT (user_id, task_id, period_key)
        DO UPDATE SET
          progress     = user_task_progress.progress + v_amount,
          last_updated = NOW();

        UPDATE public.user_task_progress SET is_completed = true
        WHERE user_id = p_user_id AND task_id = v_task.id AND period_key = v_period_key
          AND progress >= v_task.target_value AND is_completed = false;
      END LOOP;
    END IF;

    RETURN jsonb_build_object('success', true);
  END IF;

  -- ── 其他事件（share_app 等）──────────────────────────────────────────────────
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

    v_increment := 1;

    INSERT INTO public.user_task_progress (user_id, task_id, progress, period_key)
    VALUES (p_user_id, v_task.id, v_increment, v_period_key)
    ON CONFLICT (user_id, task_id, period_key)
    DO UPDATE SET progress = user_task_progress.progress + v_increment, last_updated = NOW();

    UPDATE public.user_task_progress SET is_completed = true
    WHERE user_id = p_user_id AND task_id = v_task.id AND period_key = v_period_key
      AND progress >= v_task.target_value AND is_completed = false;
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 只允許 service_role 呼叫（不開放前台直接呼叫）
REVOKE EXECUTE ON FUNCTION public.track_mission_event_for_user(UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.track_mission_event_for_user(UUID, TEXT, JSONB) TO service_role;
