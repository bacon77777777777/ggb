-- 成就改成「達標後按領取，才同時拿到積分＋徽章＋稱號」
--
-- 改之前：
--   抽獎／儲值／拉霸完成後，前端會呼叫 check_achievements，它在達標當下就
--   直接寫 user_badges、加一份積分、發稱號 —— 徽章根本沒有領取這個動作。
--   而簽到頁按「領取」走的是 claim_task_reward，又發第二份積分。
--   同一個成就玩家其實拿到兩份積分。
--
-- 改之後：
--   check_achievements  → 保留函數（前端多處在呼叫，不動簽章），但只回報
--                         達標狀態，不再寫入任何徽章、積分或稱號
--   claim_task_reward   → 領取成就任務時，一併發放綁定的徽章與稱號
--
-- 積分一律以 tasks.reward_coins 為準（玩家在簽到頁看到的數字）；
-- badges.points_reward 從此不再使用，保留欄位只為了不動歷史資料。

-- ── 1. check_achievements 只回報，不發放 ────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_achievements(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $fn$
BEGIN
  /*
   * 這支從「達標即發放」改成「什麼都不發」。
   *
   * 前端在抽獎／儲值／拉霸後都會呼叫它（api/gacha、topup、slot/spin、
   * TicketSelectionFlow），簽名與回傳格式維持不變，前端不用改。
   *
   * 成就進度由 track_mission_event 記在 user_task_progress，
   * 實際發放改由 claim_task_reward 在玩家按下領取時處理。
   */
  IF p_user_id IS NULL THEN RETURN '{"error":"user_not_found"}'::JSONB; END IF;
  RETURN jsonb_build_object('newly_earned', '[]'::jsonb, 'points_gained', 0, 'new_titles', '[]'::jsonb);
END;
$fn$;

-- ── 2. 領取時一併發徽章與稱號 ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.grant_badge_for_task(p_user_id UUID, p_task_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_badge_id TEXT;
BEGIN
  SELECT id INTO v_badge_id FROM public.badges WHERE task_id = p_task_id;
  IF v_badge_id IS NULL THEN RETURN; END IF;   -- 日／週任務沒有對應徽章，正常

  INSERT INTO public.user_badges (user_id, badge_id)
  VALUES (p_user_id, v_badge_id)
  ON CONFLICT DO NOTHING;

  -- 有些徽章掛著稱號（titles.badge_id），一起給
  INSERT INTO public.user_titles (user_id, title_id, is_selected)
  SELECT p_user_id, t.id, FALSE FROM public.titles t WHERE t.badge_id = v_badge_id
  ON CONFLICT DO NOTHING;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.grant_badge_for_task(UUID, UUID) TO service_role;

-- ── 3. claim_task_reward：改成領取時發徽章，不再呼叫 check_achievements ──
CREATE OR REPLACE FUNCTION public.claim_task_reward(p_task_id uuid, p_period_key text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $fn$
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
$fn$;
