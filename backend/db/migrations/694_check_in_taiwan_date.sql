-- 694_check_in_taiwan_date.sql
--
-- 簽到與連續天數改看台灣日期；get_check_in_status 的 next_reward 對齊現行規則
--
-- 兩個環境的 DB 時區都是 UTC，daily_check_in / get_check_in_status / track_mission_event
-- 都用 CURRENT_DATE，等於「台灣早上 8 點才換日」：
--   ① 晚上 11 點簽、隔天早上 7 點半再簽 → 被擋「今日已簽到」，要等到 8 點
--   ② 早上 7 點簽、9 點再簽 → 同一個台灣日簽兩次、拿兩份、連續天數跳兩天，第 7 天的 100 提早到手
-- FAQ 寫「每日任務每天 00:00 換一批」，同一支 649 的膜拜函式也早就用台灣日期，只有這三支沒跟上。
--
-- 三支函式都是拿線上現行定義（pg_get_functiondef）只換日期那幾行：
--   daily_check_in         v_today 改台灣日期，其餘一字未動（第 7 天 100、其餘 20 的邏輯本來就對，STG 模擬過）
--   get_check_in_status    v_today 改台灣日期；next_reward 從舊公式 10+5n 改成 20／100（前台沒讀它，但留著會誤導）
--   track_mission_event    login_streak／draw_streak／topup_streak 三段的 CURRENT_DATE 全換 v_today
--
-- 既有 daily_check_ins 的 check_in_date 是 UTC 日期，照 created_at 回填成台灣日期，
-- 不然早上 8 點前簽到的人在切換當天會斷一次連續（PROD 4 筆、STG 2 筆）。
-- 同一台灣日撞出兩筆的（8 點前後各簽一次）留最早那筆；積分已經發出去，不追回。

BEGIN;

-- ───────────────── daily_check_in ─────────────────
CREATE OR REPLACE FUNCTION public.daily_check_in(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  -- 台灣日期（migration 694）。DB 時區是 UTC，CURRENT_DATE 在台灣早上 8 點才換日
  v_today       DATE    := (NOW() AT TIME ZONE 'Asia/Taipei')::date;
  v_consecutive INTEGER := 0;
  v_check_date  DATE;
  v_cycle_day   INTEGER;
  v_reward      INTEGER;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.daily_check_ins
    WHERE user_id = p_user_id AND check_in_date = v_today
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', '今日已簽到');
  END IF;

  v_check_date := v_today - 1;
  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.daily_check_ins
      WHERE user_id = p_user_id AND check_in_date = v_check_date
    );
    v_consecutive := v_consecutive + 1;
    v_check_date  := v_check_date - 1;
  END LOOP;

  v_cycle_day := v_consecutive % 7;
  -- 第 7 天（cycle_day = 6）給 100 積分，其餘給 20
  v_reward := CASE WHEN v_cycle_day = 6 THEN 100 ELSE 20 END;

  INSERT INTO public.daily_check_ins (user_id, check_in_date, reward_amount)
  VALUES (p_user_id, v_today, v_reward);

  -- 積分一律走帳本（migration 647）。冪等鍵＝一人一天一次，
  -- 就算前台重送也只會入帳一次
  PERFORM public.grant_points(
    p_user_id, v_reward, 'check_in', '每日簽到',
    'daily_check_ins', p_user_id::text || ':' || v_today::text,
    'check_in:' || p_user_id::text || ':' || v_today::text);

  RETURN jsonb_build_object(
    'success',          true,
    'message',          '簽到成功',
    'reward',           v_reward,
    'consecutive_days', v_consecutive + 1
  );
END;
$function$;

-- ───────────────── get_check_in_status ─────────────────
-- 前台讀：consecutive_days（含今天，若今天已簽）、checked_in_today、next_reward（下一次簽到拿多少）
CREATE OR REPLACE FUNCTION public.get_check_in_status(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  -- 台灣日期（migration 694）
  v_today          DATE := (NOW() AT TIME ZONE 'Asia/Taipei')::date;
  v_consecutive    INTEGER := 0;
  v_check_date     DATE;
  v_checked_today  BOOLEAN;
  v_cycle_day      INTEGER;
  v_next_reward    INTEGER;
BEGIN
  -- 今天簽了嗎？
  SELECT EXISTS (
    SELECT 1 FROM public.daily_check_ins
    WHERE user_id = p_user_id AND check_in_date = v_today
  ) INTO v_checked_today;

  -- 往前數連續天數
  IF v_checked_today THEN
    v_consecutive := 1;
  END IF;
  v_check_date := v_today - 1;

  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.daily_check_ins
      WHERE user_id = p_user_id AND check_in_date = v_check_date
    );
    v_consecutive := v_consecutive + 1;
    v_check_date  := v_check_date - 1;
  END LOOP;

  -- 下一次簽到的獎勵（今天還沒簽 = 今天這次；今天已簽 = 明天那次）。
  -- 與 daily_check_in 同一條規則：連續 6 天後的那次（週期第 7 天）100，其餘 20
  v_cycle_day   := v_consecutive % 7;
  v_next_reward := CASE WHEN v_cycle_day = 6 THEN 100 ELSE 20 END;

  RETURN jsonb_build_object(
    'consecutive_days',  v_consecutive,
    'checked_in_today',  v_checked_today,
    'next_reward',       v_next_reward
  );
END;
$function$;

-- ───────────────── track_mission_event ─────────────────
CREATE OR REPLACE FUNCTION public.track_mission_event(p_event_type text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- 連續天數一律看台灣日期（migration 694）。DB 時區是 UTC，CURRENT_DATE 在台灣早上 8 點才換日
  v_today       DATE := (NOW() AT TIME ZONE 'Asia/Taipei')::date;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Not authenticated');
  END IF;

  -- ── LOGIN ──────────────────────────────────────────────────────────────────
  IF p_event_type = 'login' THEN
    SELECT last_login_date, login_streak INTO v_last_date, v_streak
    FROM public.users WHERE id = v_user_id;

    IF v_last_date = v_today THEN
      -- already tracked today, no-op
      NULL;
    ELSIF v_last_date = v_today - 1 THEN
      v_streak := COALESCE(v_streak, 0) + 1;
      UPDATE public.users SET login_streak = v_streak, last_login_date = v_today WHERE id = v_user_id;
    ELSE
      v_streak := 1;
      UPDATE public.users SET login_streak = 1, last_login_date = v_today WHERE id = v_user_id;
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
    IF v_last_date IS DISTINCT FROM v_today THEN
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

    IF v_last_date = v_today THEN
      UPDATE public.users SET total_draws = COALESCE(total_draws, 0) + v_amount WHERE id = v_user_id;
    ELSIF v_last_date = v_today - 1 THEN
      v_streak := COALESCE(v_streak, 0) + 1;
      UPDATE public.users SET
        total_draws = COALESCE(total_draws, 0) + v_amount,
        draw_streak = v_streak,
        last_draw_date = v_today
      WHERE id = v_user_id;
    ELSE
      v_streak := 1;
      UPDATE public.users SET
        total_draws = COALESCE(total_draws, 0) + v_amount,
        draw_streak = 1,
        last_draw_date = v_today
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
      AND created_at >= date_trunc('day', NOW() AT TIME ZONE 'Asia/Taipei') AT TIME ZONE 'Asia/Taipei'
      AND COALESCE(prize_level, '') <> 'coin_return';

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

    IF v_last_date = v_today THEN
      IF v_amount > 0 THEN
        UPDATE public.users SET total_topup = COALESCE(total_topup, 0) + v_amount WHERE id = v_user_id;
      END IF;
    ELSIF v_last_date = v_today - 1 THEN
      v_streak := COALESCE(v_streak, 0) + 1;
      UPDATE public.users SET
        total_topup   = COALESCE(total_topup, 0) + v_amount,
        topup_streak  = v_streak,
        last_topup_date = v_today
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
        last_topup_date = v_today
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
$function$

;

-- ───────────────── 既有簽到資料回填成台灣日期 ─────────────────
DO $$
DECLARE
  r RECORD;
  v_deleted INTEGER := 0;
  v_shifted INTEGER := 0;
BEGIN
  -- 同一台灣日有兩筆：留最早那筆
  FOR r IN
    SELECT id FROM (
      SELECT id,
             row_number() OVER (
               PARTITION BY user_id, (created_at AT TIME ZONE 'Asia/Taipei')::date
               ORDER BY created_at, id
             ) AS rn
      FROM public.daily_check_ins
    ) x WHERE rn > 1
  LOOP
    DELETE FROM public.daily_check_ins WHERE id = r.id;
    v_deleted := v_deleted + 1;
  END LOOP;

  -- UTC 日期 → 台灣日期只會往後推一天。從最新的往回改，
  -- 才不會在同一句 UPDATE 裡撞到還沒改的下一天（unique (user_id, check_in_date)）
  FOR r IN
    SELECT id, (created_at AT TIME ZONE 'Asia/Taipei')::date AS tw_date
    FROM public.daily_check_ins
    WHERE check_in_date <> (created_at AT TIME ZONE 'Asia/Taipei')::date
    ORDER BY check_in_date DESC, id DESC
  LOOP
    UPDATE public.daily_check_ins SET check_in_date = r.tw_date WHERE id = r.id;
    v_shifted := v_shifted + 1;
  END LOOP;

  RAISE NOTICE 'daily_check_ins 回填：刪重複 % 筆、改日期 % 筆', v_deleted, v_shifted;
END $$;

COMMIT;
