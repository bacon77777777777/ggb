-- 464: 統一膜拜寫入的表，讓真實玩家的膜拜真的會 +1
--
-- ── 問題 ──
-- 兩個環境的 worship_player() 各寫各的表：
--   STG  → worship_logs      （worshipper_id, target_id, worship_date）
--   PROD → user_worship_logs （user_id, target_id, created_at）
-- 但 462 讓兩邊的 get_player_profile 都從 worship_logs 數「被膜拜次數」。
-- 結果 PROD 上真實玩家按了膜拜，紀錄進 user_worship_logs，
-- 資訊小卡的數字永遠不會動 —— 排行榜還有「膜拜1次」的每日任務，
-- 玩家天天按、天天看到同一個數字。
--
-- ── 改法 ──
-- 一律寫 worship_logs（機器人展示資料也在這張表，真實玩家膜拜機器人會直接累加）。
-- 邏輯取兩版的聯集：
--   PROD 版有的：目標存在檢查、total_worships、like_ranking 任務進度、台北時區
--   STG  版有的：unique_violation 處理（兩人同時按的競態）
--
-- 兩處刻意不照抄 STG 版：
--   1. v_today 用台北時區。STG 版是 CURRENT_DATE，那是 UTC ——
--      台灣時間凌晨 0~8 點會被算成前一天，等於那段時間可以多膜拜一次。
--   2. 拿掉 WHEN OTHERS THEN RETURN success:false, SQLERRM。
--      PROD 的 42P01（表不存在）就是被這種攔截器吞成一句提示的，
--      前台只看到「膜拜失敗」，沒人知道是整張表沒建。真的壞掉就要讓它壞得看得見。

-- STG 沒有這個欄位（PROD 有）
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_worships INTEGER DEFAULT 0;

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
    RETURN jsonb_build_object('success', false, 'message', '今天已經膜拜過大佬了，明天再來吧！');
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

COMMENT ON FUNCTION public.worship_player IS
  '膜拜玩家。一人一天一次，寫入 worship_logs（與資訊小卡的被膜拜次數同一張表），+10 積分並推進 like_ranking 任務。';

-- PROD 專用的舊表，0 列、只有舊版 worship_player 引用（上面已改寫）。
-- 留著只會讓下一個人再踩一次「寫 A 表讀 B 表」。
DROP TABLE IF EXISTS user_worship_logs;

-- 機器人的 total_worships 補上，跟它們已種的膜拜紀錄對得起來
UPDATE users u
SET total_worships = w.c
FROM (SELECT worshipper_id, count(*) c FROM worship_logs GROUP BY 1) w
WHERE u.id = w.worshipper_id AND u.is_bot;
