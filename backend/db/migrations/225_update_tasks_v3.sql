-- =============================================
-- 225_update_tasks_v3.sql
-- 更新每日/每週任務 list，並支援 amount-based tracking
-- =============================================

-- 1. 移除舊有 condition_type 約束，允許新類型
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_condition_type_check;

-- 2. 停用所有現有每日/每週任務
UPDATE public.tasks SET is_active = FALSE WHERE type IN ('daily', 'weekly');

-- 3. 新增每日任務 (總上限 110 積分)
INSERT INTO public.tasks (type, title, description, target_value, reward_coins, condition_type, icon_name, sort_order, is_active) VALUES
('daily', '每日登入',       '每日首次登入網站',            1,  5,  'login',                'Log-in',   1, true),
('daily', '瀏覽5個商品',   '本日瀏覽 5 個不同商品頁',     5,  5,  'view_product',         'Eye',      2, true),
('daily', '排行榜膜拜1次', '在排行榜完成 1 次膜拜',        1,  5,  'like_ranking',         'Heart',    3, true),
('daily', '分享任一商品',  '分享任一商品連結',             1,  5,  'share_app',            'Share',    4, true),
('daily', '查看中獎紀錄',  '查看個人抽獎紀錄頁面',         1,  5,  'view_winning_records', 'Trophy',   5, true),
('daily', '完成1次轉蛋',   '本日完成 1 次任意商品轉蛋',    1,  10, 'draw_count',           'Ticket',   6, true),
('daily', '完成3次轉蛋',   '本日累計完成 3 次轉蛋',        3,  15, 'draw_count',           'Layers',   7, true),
('daily', '消耗20積分',    '本日消耗 20 積分',             20, 10, 'spend_points',         'Sparkles', 8, true),
('daily', '今日首次儲值',  '今日首次完成任意金額儲值',      1,  20, 'recharge',             'Wallet',   9, true),
('daily', '完成全部每日任務', '完成以上全部每日任務',       1,  30, 'complete_all_daily',   'Star',    10, true);

-- 4. 新增每週任務
INSERT INTO public.tasks (type, title, description, target_value, reward_coins, condition_type, icon_name, sort_order, is_active) VALUES
('weekly', '累積登入5天',   '本週累積登入 5 天',           5,    50,   'login',           'Calendar',  1, true),
('weekly', '轉蛋10次',      '本週累積完成 10 次轉蛋',      10,   100,  'draw_count',      'Ticket',    2, true),
('weekly', '轉蛋20次',      '本週累積完成 20 次轉蛋',      20,   250,  'draw_count',      'Layers',    3, true),
('weekly', '轉蛋30次',      '本週累積完成 30 次轉蛋',      30,   500,  'draw_count',      'Layers',    4, true),
('weekly', '儲值100代幣',   '本週累積儲值達 100 代幣',     100,  50,   'recharge_amount', 'Wallet',    5, true),
('weekly', '儲值500代幣',   '本週累積儲值達 500 代幣',     500,  250,  'recharge_amount', 'Wallet',    6, true),
('weekly', '儲值1000代幣',  '本週累積儲值達 1,000 代幣',  1000,  600,  'recharge_amount', 'Wallet',    7, true),
('weekly', '消費100代幣',   '本週累積消費 100 代幣',       100,  50,   'spend_amount',    'Coins',     8, true),
('weekly', '消費300代幣',   '本週累積消費 300 代幣',       300,  150,  'spend_amount',    'Coins',     9, true),
('weekly', '邀請5位好友',   '本週成功邀請 5 位好友',         5,  1000,  'invite_friend',   'Users',    10, true);

-- 5. 更新 track_mission_event：支援 amount-based 累積（spend_amount / recharge_amount / spend_points）
--    以及 draw_count 支援批次 count
CREATE OR REPLACE FUNCTION public.track_mission_event(
  p_event_type TEXT,
  p_data JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id   UUID;
  v_task      RECORD;
  v_period_key TEXT;
  v_meta      JSONB;
  v_item_id   TEXT;
  v_increment INT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Not authenticated');
  END IF;

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

    -- Amount-based events use p_data->>'amount'; draw_count uses p_data->>'count'
    IF p_event_type IN ('spend_amount', 'recharge_amount', 'spend_points') THEN
      v_increment := GREATEST(1, COALESCE((p_data->>'amount')::INT, 1));
    ELSIF p_event_type = 'draw_count' THEN
      v_increment := GREATEST(1, COALESCE((p_data->>'count')::INT, 1));
    ELSE
      v_increment := 1;
    END IF;

    IF p_event_type = 'view_product' THEN
      v_item_id := p_data->>'product_id';

      SELECT metadata INTO v_meta
      FROM public.user_task_progress
      WHERE user_id = v_user_id AND task_id = v_task.id AND period_key = v_period_key;

      IF NOT FOUND THEN
        v_meta := '{"viewed_ids": []}'::jsonb;
      ELSIF v_meta IS NULL THEN
        v_meta := '{"viewed_ids": []}'::jsonb;
      END IF;

      IF v_meta->'viewed_ids' ? v_item_id THEN
        CONTINUE;
      END IF;

      IF NOT (v_meta ? 'viewed_ids') THEN
        v_meta := jsonb_set(v_meta, '{viewed_ids}', '[]'::jsonb);
      END IF;

      v_meta := jsonb_set(v_meta, '{viewed_ids}', (v_meta->'viewed_ids') || to_jsonb(v_item_id));

      INSERT INTO public.user_task_progress (user_id, task_id, progress, period_key, metadata)
      VALUES (v_user_id, v_task.id, 1, v_period_key, v_meta)
      ON CONFLICT (user_id, task_id, period_key)
      DO UPDATE SET
        progress = public.user_task_progress.progress + 1,
        metadata = EXCLUDED.metadata,
        last_updated = NOW();
    ELSE
      INSERT INTO public.user_task_progress (user_id, task_id, progress, period_key)
      VALUES (v_user_id, v_task.id, v_increment, v_period_key)
      ON CONFLICT (user_id, task_id, period_key)
      DO UPDATE SET
        progress = public.user_task_progress.progress + v_increment,
        last_updated = NOW();
    END IF;

    -- 達標時標記為 completed
    UPDATE public.user_task_progress
    SET is_completed = true
    WHERE user_id = v_user_id
      AND task_id = v_task.id
      AND period_key = v_period_key
      AND progress >= v_task.target_value
      AND is_completed = false;
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.track_mission_event(TEXT, JSONB) TO authenticated;

-- 6. 更新 claim_task_reward：領完所有每日任務後自動解鎖「完成全部每日任務」
CREATE OR REPLACE FUNCTION public.claim_task_reward(
  p_task_id    UUID,
  p_period_key TEXT
) RETURNS JSONB AS $$
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

  -- 若領取的是每日任務（非 complete_all_daily），檢查是否全部完成
  IF v_task.type = 'daily' AND v_task.condition_type <> 'complete_all_daily' THEN
    SELECT NOT EXISTS (
      SELECT 1 FROM public.tasks t
      LEFT JOIN public.user_task_progress utp
        ON utp.task_id = t.id
        AND utp.user_id = v_user_id
        AND utp.period_key = p_period_key
      WHERE t.type = 'daily'
        AND t.is_active = TRUE
        AND t.condition_type <> 'complete_all_daily'
        AND (utp.is_claimed IS NULL OR utp.is_claimed = FALSE)
    ) INTO v_all_claimed;

    IF v_all_claimed THEN
      SELECT * INTO v_complete_all_task
      FROM public.tasks
      WHERE type = 'daily' AND condition_type = 'complete_all_daily' AND is_active = TRUE
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.claim_task_reward(UUID, TEXT) TO authenticated;
