-- 649_points_via_ledger.sql
--
-- 把五條「加點」路徑改成走 grant_points()，不再直接 UPDATE users.points。
--
-- 每一支都是拿線上現行定義（pg_get_functiondef 撈下來的）**只換掉那一行 UPDATE**，
-- 其餘一字未動 —— 這幾支裡面有簽到連續天數、任務連鎖、邀請階梯、LINE 一生一次
-- 這些難重寫的邏輯，重打一遍只會引進新 bug。
--
-- 扣點那兩條（play_gacha／play_ichiban）在 650 處理，它們有自己的鎖順序要顧。
--
-- 冪等鍵的取法：能表達「同一個動作」的自然鍵。
--   簽到     check_in:<uid>:<日期>        一人一天一次
--   任務     task:<uid>:<task>:<期別>     一期一次
--   LINE     line_bonus:<line_sub>        一顆 LINE 一生一次
--   膜拜     worship:<uid>:<日期>         一人一天一次
--   邀請     不帶 —— 擋重複的是 referral_cycle_claims 的唯一鍵

BEGIN;

-- ───────────────── daily_check_in ─────────────────
CREATE OR REPLACE FUNCTION public.daily_check_in(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_today       DATE    := CURRENT_DATE;
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

-- ───────────────── claim_task_reward ─────────────────
CREATE OR REPLACE FUNCTION public.claim_task_reward(p_task_id uuid, p_period_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user_id             UUID := auth.uid();
  v_task                RECORD;
  v_progress            RECORD;
  v_all_claimed         BOOLEAN;
  v_complete_all_task   RECORD;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id AND is_active = TRUE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', 'Task not found'); END IF;

  SELECT * INTO v_progress
  FROM public.user_task_progress
  WHERE user_id = v_user_id AND task_id = p_task_id AND period_key = p_period_key;

  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', 'Task not started'); END IF;
  IF v_progress.is_claimed THEN RETURN jsonb_build_object('success', false, 'message', 'Already claimed'); END IF;
  IF v_progress.progress < v_task.target_value THEN RETURN jsonb_build_object('success', false, 'message', 'Task not completed'); END IF;

  UPDATE public.user_task_progress
  SET is_claimed = TRUE, last_updated = NOW()
  WHERE user_id = v_user_id AND task_id = p_task_id AND period_key = p_period_key;

  -- 積分一律走帳本（migration 647）。獎勵為 0 的任務不寫帳（grant_points 不收 0）
  IF COALESCE(v_task.reward_coins, 0) > 0 THEN
    PERFORM public.grant_points(
      v_user_id, v_task.reward_coins, 'task', '任務獎勵：' || COALESCE(v_task.title, p_task_id::text),
      'user_task_progress', v_user_id::text || ':' || p_task_id::text || ':' || p_period_key,
      'task:' || v_user_id::text || ':' || p_task_id::text || ':' || p_period_key);
  END IF;

  -- 成就任務：領取的同時把綁定的徽章與稱號一起發出去（migration 544）
  -- 日／週任務沒有綁徽章，grant_badge_for_task 會直接返回
  PERFORM public.grant_badge_for_task(v_user_id, p_task_id);

  -- 若領取的是每日任務（非 complete_all_daily），檢查是否全部完成
  IF v_task.type = 'daily' AND v_task.condition_type <> 'complete_all_daily' THEN
    SELECT NOT EXISTS (
      SELECT 1 FROM public.tasks t
      LEFT JOIN public.user_task_progress utp
        ON utp.task_id = t.id AND utp.user_id = v_user_id AND utp.period_key = p_period_key
      WHERE t.type = 'daily' AND t.is_active = TRUE AND t.condition_type <> 'complete_all_daily'
        AND (utp.is_claimed IS NULL OR utp.is_claimed = FALSE)
    ) INTO v_all_claimed;

    IF v_all_claimed THEN
      SELECT * INTO v_complete_all_task
      FROM public.tasks WHERE type = 'daily' AND condition_type = 'complete_all_daily' AND is_active = TRUE
      LIMIT 1;

      IF FOUND THEN
        INSERT INTO public.user_task_progress (user_id, task_id, progress, period_key, is_completed)
        VALUES (v_user_id, v_complete_all_task.id, 1, p_period_key, TRUE)
        ON CONFLICT (user_id, task_id, period_key)
        DO UPDATE SET progress = 1, is_completed = TRUE, last_updated = NOW();
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'reward', v_task.reward_coins);
END;
$function$;

-- ───────────────── claim_referral_cycle_reward ─────────────────
CREATE OR REPLACE FUNCTION public.claim_referral_cycle_reward()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_step      CONSTANT int := 5;
  v_per       CONSTANT int := 100;
  v_qualified int;
  v_available int;
  v_m         int;
  v_total     int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT count(*) INTO v_qualified
  FROM referrals WHERE referrer_id = v_uid AND qualified_at IS NOT NULL;

  v_available := v_qualified / v_step;
  FOR v_m IN 1..v_available LOOP
    BEGIN
      INSERT INTO referral_cycle_claims (user_id, milestone, points)
      VALUES (v_uid, v_m * v_step, v_per);
      v_total := v_total + v_per;
    EXCEPTION WHEN unique_violation THEN
      NULL; -- 這一階領過了
    END;
  END LOOP;

  IF v_total > 0 THEN
    -- 積分一律走帳本（migration 647）。這裡不帶冪等鍵：擋重複的是上面
    -- referral_cycle_claims 的唯一鍵 —— 重跑時一階都插不進去，v_total 會是 0，
    -- 整個 IF 區塊根本不會進來
    PERFORM public.grant_points(
      v_uid, v_total, 'referral', '邀請循環獎勵',
      'referral_cycle_claims', v_uid::text, NULL);
    -- 領取回條 —— 累積起來就是領取紀錄
    INSERT INTO notifications (user_id, type, title, body, link, meta)
    VALUES (v_uid, 'reward', '邀請獎勵已入帳',
            '已領取 ' || v_total || ' 積分，到任務中心看看你的積分吧。',
            '/mission', jsonb_build_object('points', v_total));
  END IF;

  RETURN jsonb_build_object('success', true, 'claimed_points', v_total, 'qualified', v_qualified);
END;
$function$;

-- ───────────────── apply_line_perks ─────────────────
CREATE OR REPLACE FUNCTION public.apply_line_perks(p_user_id uuid, p_line_sub text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_new_line  boolean := false;
  v_bonus     int := 0;
  v_referrer  uuid;
  v_created   timestamptz;
  v_ref_count int;
  v_launch    CONSTANT timestamptz := '2026-08-08 00:00:00+08'; -- 新戶分界
BEGIN
  IF p_user_id IS NULL OR p_line_sub IS NULL OR p_line_sub = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'bad args');
  END IF;

  -- 一顆 LINE 一生一次：搶到 insert 的帳號才有後續
  INSERT INTO line_grant_ledger (line_sub, user_id)
  VALUES (p_line_sub, p_user_id)
  ON CONFLICT (line_sub) DO NOTHING;
  v_new_line := FOUND;

  IF v_new_line THEN
    SELECT created_at INTO v_created FROM users WHERE id = p_user_id;
    IF v_created >= v_launch THEN
      v_bonus := 300;
      -- 積分一律走帳本（migration 647）。冪等鍵用 line_sub：一顆 LINE 一生一次
      PERFORM public.grant_points(
        p_user_id, v_bonus, 'line_bonus', 'LINE 綁定禮',
        'line_grant_ledger', p_line_sub,
        'line_bonus:' || p_line_sub);
      UPDATE line_grant_ledger SET bonus_points = v_bonus WHERE line_sub = p_line_sub;
      -- 入帳回條
      INSERT INTO notifications (user_id, type, title, body, link, meta)
      VALUES (p_user_id, 'reward', 'LINE 綁定禮已入帳',
              '感謝綁定 LINE，300 積分已加到你的帳上，到任務中心看看吧。',
              '/mission', jsonb_build_object('points', v_bonus));
    END IF;
  END IF;

  -- 邀請計入：這顆 LINE 必須是被「這個帳號」首次消耗的，且有未生效邀請。
  -- 空殼奪綁後再填碼 → 帳本掛在空殼名下 → 不成立，刷不動
  IF EXISTS (SELECT 1 FROM line_grant_ledger
             WHERE line_sub = p_line_sub AND user_id = p_user_id) THEN
    UPDATE referrals SET qualified_at = now()
    WHERE referee_id = p_user_id AND qualified_at IS NULL
    RETURNING referrer_id INTO v_referrer;

    IF v_referrer IS NOT NULL THEN
      UPDATE users SET total_referrals = COALESCE(total_referrals, 0) + 1
      WHERE id = v_referrer;
      -- 驅動週任務（invite_friend weekly）與四階成就（ALL）
      PERFORM track_mission_event_for_user(v_referrer, 'invite_friend', '{}');

      -- 進度剛好踩到 5 的倍數 → 提醒邀請人回來領（他不會自己知道）
      SELECT count(*) INTO v_ref_count
      FROM referrals WHERE referrer_id = v_referrer AND qualified_at IS NOT NULL;
      IF v_ref_count % 5 = 0 THEN
        INSERT INTO notifications (user_id, type, title, body, link, meta)
        VALUES (v_referrer, 'reward', '邀請獎勵可以領了',
                '你已成功邀請 ' || v_ref_count || ' 位好友，到邀請好友頁領取 100 積分吧。',
                '/invite', jsonb_build_object('qualified', v_ref_count));
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'new_line', v_new_line,
    'bonus', v_bonus, 'referrer', v_referrer
  );
END;
$function$;

-- ───────────────── worship_player ─────────────────
CREATE OR REPLACE FUNCTION public.worship_player(p_target_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id   UUID := auth.uid();
  v_today     DATE := (NOW() AT TIME ZONE 'Asia/Taipei')::date;
  v_today_str TEXT := to_char(NOW() AT TIME ZONE 'Asia/Taipei', 'YYYY-MM-DD');
  v_task      RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '請先登入');
  END IF;

  IF v_user_id = p_target_id THEN
    RETURN jsonb_build_object('success', false, 'message', '不能膜拜自己');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_target_id) THEN
    RETURN jsonb_build_object('success', false, 'message', '找不到該玩家');
  END IF;

  IF EXISTS (
    SELECT 1 FROM worship_logs
    WHERE worshipper_id = v_user_id AND worship_date = v_today
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', '今天已經膜拜過大神了，明天再來吧！');
  END IF;

  INSERT INTO worship_logs (worshipper_id, target_id, worship_date)
  VALUES (v_user_id, p_target_id, v_today);

  -- 膜拜次數留在這裡，積分改走帳本（migration 647）
  UPDATE users
  SET total_worships = COALESCE(total_worships, 0) + 1
  WHERE id = v_user_id;

  PERFORM public.grant_points(
    v_user_id, 10, 'worship', '膜拜玩家',
    'worship_logs', v_user_id::text || ':' || v_today::text,
    'worship:' || v_user_id::text || ':' || v_today::text);

  -- 排行榜膜拜相關任務（每日「膜拜1次」、成就「排行榜信徒」）
  FOR v_task IN
    SELECT id, type, target_value FROM tasks
    WHERE condition_type = 'like_ranking' AND is_active = TRUE
  LOOP
    IF v_task.type = 'daily' THEN
      INSERT INTO user_task_progress (user_id, task_id, period_key, progress, is_completed)
      VALUES (v_user_id, v_task.id, v_today_str, 1, TRUE)
      ON CONFLICT (user_id, task_id, period_key) DO UPDATE
        SET progress     = LEAST(user_task_progress.progress + 1, v_task.target_value),
            is_completed = (user_task_progress.progress + 1 >= v_task.target_value);

    ELSIF v_task.type = 'achievement' THEN
      INSERT INTO user_task_progress (user_id, task_id, period_key, progress, is_completed)
      VALUES (v_user_id, v_task.id, 'ALL', 1, (1 >= v_task.target_value))
      ON CONFLICT (user_id, task_id, period_key) DO UPDATE
        SET progress     = user_task_progress.progress + 1,
            is_completed = (user_task_progress.progress + 1 >= v_task.target_value);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'message', '膜拜成功！獲得 10 積分');

-- 只攔這一種：唯一索引 (worshipper_id, worship_date) 擋下的同時雙擊。
-- 對玩家來說跟「今天已膜拜」是同一件事，不需要看到錯誤。
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'message', '今天已經膜拜過了');
END;
$function$;

COMMIT;
