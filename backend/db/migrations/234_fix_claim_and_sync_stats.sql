-- 1. Update claim_task_reward to call check_achievements so badges are granted on claim
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

  UPDATE public.users
  SET points = COALESCE(points, 0) + v_task.reward_coins
  WHERE id = v_user_id;

  -- Check and grant any newly earned badges
  PERFORM public.check_achievements(v_user_id);

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

-- 2. Sync existing users' stats from actual records (one-time backfill)
UPDATE public.users u
SET total_draws = sub.cnt
FROM (
  SELECT user_id, COUNT(*) AS cnt FROM public.draw_records WHERE status = 'success' GROUP BY user_id
) sub
WHERE u.id = sub.user_id AND (u.total_draws IS NULL OR u.total_draws < sub.cnt);

UPDATE public.users u
SET total_topup = sub.total
FROM (
  SELECT user_id, SUM(amount) AS total FROM public.recharge_records WHERE status = 'success' GROUP BY user_id
) sub
WHERE u.id = sub.user_id AND (u.total_topup IS NULL OR u.total_topup < sub.total);

UPDATE public.users u
SET total_referrals = sub.cnt
FROM (
  SELECT referrer_id AS user_id, COUNT(*) AS cnt FROM public.referrals GROUP BY referrer_id
) sub
WHERE u.id = sub.user_id AND (u.total_referrals IS NULL OR u.total_referrals < sub.cnt);
