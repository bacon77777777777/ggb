-- 519: 膜拜文案改台灣用詞（老闆指定：「大佬」是中國用語，改「大神」）
--
-- 全文照 PROD 現行定義複製，**只改一個字串**：
--   '今天已經膜拜過大佬了，明天再來吧！' → '大神'
-- 任務進度追蹤與 unique_violation 例外處理原封不動。
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

  UPDATE users
  SET points         = COALESCE(points, 0) + 10,
      total_worships = COALESCE(total_worships, 0) + 1
  WHERE id = v_user_id;

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
