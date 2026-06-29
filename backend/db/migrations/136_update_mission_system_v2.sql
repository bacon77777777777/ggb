-- 1. Update Users Table (Add Points)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 0;

-- 2. Update Tasks Table Schema
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_condition_type_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_condition_type_check 
  CHECK (condition_type IN ('login', 'draw_count', 'spend_amount', 'share_app', 'view_product', 'like_ranking', 'recharge', 'win_sr', 'play_unique_machine'));

-- 3. Update User Task Progress Schema
ALTER TABLE public.user_task_progress ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 4. Clean up old tasks to ensure fresh start for this specific requirement
DELETE FROM public.tasks WHERE type IN ('daily', 'weekly');

-- 5. Insert New Tasks (Daily & Weekly)
-- Daily Tasks (200 pts total)
INSERT INTO public.tasks (type, title, description, target_value, reward_coins, condition_type, icon_name) VALUES
('daily', '每日登入', '本日首次登入網站', 1, 10, 'login', 'Log-in'),
('daily', '瀏覽商品', '瀏覽 3 個不同的抽卡商品頁', 3, 10, 'view_product', 'Eye'),
('daily', '社群分享', '分享 1 次抽卡結果或商品連結', 1, 10, 'share_app', 'Share'),
('daily', '關注排行', '進入排行榜頁面並進行 1 次膜拜/按讚', 1, 10, 'like_ranking', 'Heart'),
('daily', '每日首抽', '完成 1 次任意商品抽卡', 1, 20, 'draw_count', 'Ticket'),
('daily', '累計抽卡 I', '本日累計完成 3 次抽卡', 3, 20, 'draw_count', 'Layers'),
('daily', '累計抽卡 II', '本日累計完成 5 次抽卡', 5, 30, 'draw_count', 'Layers'),
('daily', '累計抽卡 III', '本日累計完成 10 次抽卡', 10, 40, 'draw_count', 'Layers'),
('daily', '每日首儲', '本日完成任意金額代幣儲值', 1, 30, 'recharge', 'Wallet'),
('daily', '歐氣爆發', '本日獲得 1 次 SR (含) 以上獎項', 1, 20, 'win_sr', 'Sparkles');

-- Weekly Tasks (1000 pts total)
INSERT INTO public.tasks (type, title, description, target_value, reward_coins, condition_type, icon_name) VALUES
('weekly', '累計登入 I', '本週累計登入達 3 天', 3, 50, 'login', 'Calendar'),
('weekly', '累計登入 II', '本週累計登入達 5 天', 5, 50, 'login', 'Calendar'),
('weekly', '全勤報到', '本週累計登入達 7 天', 7, 100, 'login', 'Calendar-Check'),
('weekly', '廣泛探索', '本週參與過 3 種不同的抽卡機台/卡包', 3, 100, 'play_unique_machine', 'Compass'),
('weekly', '試試手氣', '本週累計完成 10 次抽卡', 10, 50, 'draw_count', 'Ticket'),
('weekly', '抽卡達人 I', '本週累計完成 30 次抽卡', 30, 100, 'draw_count', 'Layers'),
('weekly', '抽卡達人 II', '本週累計完成 50 次抽卡', 50, 150, 'draw_count', 'Layers'),
('weekly', '抽卡狂熱', '本週累計完成 100 次抽卡', 100, 200, 'draw_count', 'Layers'),
('weekly', '財富密碼', '本週累計消耗 5,000 代幣', 5000, 100, 'spend_amount', 'Coins'),
('weekly', '歐洲血統', '本週累計獲得 3 次 SR (含) 以上獎項', 3, 100, 'win_sr', 'Crown');

-- 6. RPC: Track Mission Event (Frontend triggers)
CREATE OR REPLACE FUNCTION track_mission_event(p_event_type TEXT, p_data JSONB DEFAULT '{}'::jsonb)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_task RECORD;
  v_period_key TEXT;
  v_current_progress INT;
  v_meta JSONB;
  v_item_id TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Not authenticated');
  END IF;

  -- Loop through active tasks matching the event type
  FOR v_task IN SELECT * FROM tasks WHERE condition_type = p_event_type AND is_active = true LOOP
    
    -- Set Period Key
    IF v_task.type = 'daily' THEN
      v_period_key := to_char(NOW(), 'YYYY-MM-DD');
    ELSIF v_task.type = 'weekly' THEN
      v_period_key := to_char(NOW(), 'IYYY-IW');
    ELSE
      v_period_key := 'ALL';
    END IF;

    -- Special Logic for 'view_product' (Unique Check)
    IF p_event_type = 'view_product' THEN
      v_item_id := p_data->>'product_id';
      
      -- Get current progress and metadata
      SELECT progress, metadata INTO v_current_progress, v_meta 
      FROM user_task_progress 
      WHERE user_id = v_user_id AND task_id = v_task.id AND period_key = v_period_key;
      
      IF NOT FOUND THEN
        v_current_progress := 0;
        v_meta := '{"viewed_ids": []}'::jsonb;
      ELSIF v_meta IS NULL THEN
        v_meta := '{"viewed_ids": []}'::jsonb;
      END IF;
      
      -- Check uniqueness
      IF v_meta->'viewed_ids' ? v_item_id THEN
        CONTINUE; -- Already viewed this product
      END IF;
      
      -- Update Metadata
      -- Ensure viewed_ids exists
      IF NOT (v_meta ? 'viewed_ids') THEN
         v_meta := jsonb_set(v_meta, '{viewed_ids}', '[]'::jsonb);
      END IF;

      v_meta := jsonb_set(v_meta, '{viewed_ids}', (v_meta->'viewed_ids') || to_jsonb(v_item_id));
      
      -- Insert/Update
      INSERT INTO user_task_progress (user_id, task_id, progress, period_key, metadata)
      VALUES (v_user_id, v_task.id, 1, v_period_key, v_meta)
      ON CONFLICT (user_id, task_id, period_key)
      DO UPDATE SET 
        progress = user_task_progress.progress + 1,
        metadata = EXCLUDED.metadata,
        last_updated = NOW();
        
    -- Standard Increment Logic (Share, Like)
    ELSE
      INSERT INTO user_task_progress (user_id, task_id, progress, period_key)
      VALUES (v_user_id, v_task.id, 1, v_period_key)
      ON CONFLICT (user_id, task_id, period_key)
      DO UPDATE SET 
        progress = user_task_progress.progress + 1,
        last_updated = NOW();
    END IF;

    -- Check Completion
    UPDATE user_task_progress 
    SET is_completed = true 
    WHERE user_id = v_user_id 
      AND task_id = v_task.id 
      AND period_key = v_period_key 
      AND progress >= v_task.target_value 
      AND is_completed = false;
      
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Trigger Update: Handle Draw-related Missions
CREATE OR REPLACE FUNCTION handle_new_draw_mission_progress()
RETURNS TRIGGER AS $$
DECLARE
  v_task RECORD;
  v_period_key TEXT;
  v_price INT;
  v_is_major BOOLEAN;
  v_meta JSONB;
  v_product_id TEXT;
BEGIN
  -- Loop through all relevant tasks
  FOR v_task IN SELECT * FROM tasks WHERE is_active = true AND 
    condition_type IN ('draw_count', 'spend_amount', 'win_sr', 'play_unique_machine') LOOP
    
    -- Set Period Key
    IF v_task.type = 'daily' THEN
      v_period_key := to_char(NEW.created_at, 'YYYY-MM-DD');
    ELSIF v_task.type = 'weekly' THEN
      v_period_key := to_char(NEW.created_at, 'IYYY-IW');
    ELSE
      v_period_key := 'ALL';
    END IF;

    -- Logic per condition
    IF v_task.condition_type = 'draw_count' THEN
        INSERT INTO user_task_progress (user_id, task_id, progress, period_key)
        VALUES (NEW.user_id, v_task.id, 1, v_period_key)
        ON CONFLICT (user_id, task_id, period_key)
        DO UPDATE SET progress = user_task_progress.progress + 1, last_updated = NOW();

    ELSIF v_task.condition_type = 'spend_amount' THEN
        -- Get price from products table
        SELECT price INTO v_price FROM products WHERE id = NEW.product_id;
        IF v_price IS NULL THEN v_price := 0; END IF;
        
        INSERT INTO user_task_progress (user_id, task_id, progress, period_key)
        VALUES (NEW.user_id, v_task.id, v_price, v_period_key)
        ON CONFLICT (user_id, task_id, period_key)
        DO UPDATE SET progress = user_task_progress.progress + v_price, last_updated = NOW();

    ELSIF v_task.condition_type = 'win_sr' THEN
        -- Check if prize is Major Prize (SR equivalent)
        SELECT NEW.prize_level = ANY(major_prizes) INTO v_is_major FROM products WHERE id = NEW.product_id;
        
        -- Fallback: Check if prize level starts with S, A, B or is Last One
        IF v_is_major IS NULL OR v_is_major = false THEN
           IF NEW.prize_level IN ('A', 'B', 'S', 'SS', 'SSR', 'SR', 'UR', 'Last One', 'LAST ONE', 'SP') OR NEW.prize_level LIKE '%賞' THEN
             v_is_major := true;
           END IF;
        END IF;

        IF v_is_major THEN
            INSERT INTO user_task_progress (user_id, task_id, progress, period_key)
            VALUES (NEW.user_id, v_task.id, 1, v_period_key)
            ON CONFLICT (user_id, task_id, period_key)
            DO UPDATE SET progress = user_task_progress.progress + 1, last_updated = NOW();
        END IF;

    ELSIF v_task.condition_type = 'play_unique_machine' THEN
        v_product_id := NEW.product_id::text;
        
        -- Get current meta
        SELECT metadata INTO v_meta FROM user_task_progress 
        WHERE user_id = NEW.user_id AND task_id = v_task.id AND period_key = v_period_key;
        
        IF v_meta IS NULL THEN v_meta := '{"played_ids": []}'::jsonb; END IF;
        
        IF NOT (v_meta->'played_ids' ? v_product_id) THEN
             IF NOT (v_meta ? 'played_ids') THEN
                v_meta := jsonb_set(v_meta, '{played_ids}', '[]'::jsonb);
             END IF;

             v_meta := jsonb_set(v_meta, '{played_ids}', (v_meta->'played_ids') || to_jsonb(v_product_id));
             
             INSERT INTO user_task_progress (user_id, task_id, progress, period_key, metadata)
             VALUES (NEW.user_id, v_task.id, 1, v_period_key, v_meta)
             ON CONFLICT (user_id, task_id, period_key)
             DO UPDATE SET progress = user_task_progress.progress + 1, metadata = v_meta, last_updated = NOW();
        END IF;
    END IF;

    -- Check completion
    UPDATE user_task_progress 
    SET is_completed = true 
    WHERE user_id = NEW.user_id 
      AND task_id = v_task.id 
      AND period_key = v_period_key 
      AND progress >= v_task.target_value 
      AND is_completed = false;
      
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Trigger for Recharge (Top-up)
CREATE OR REPLACE FUNCTION handle_recharge_mission_progress()
RETURNS TRIGGER AS $$
DECLARE
  v_task RECORD;
  v_period_key TEXT;
BEGIN
  IF NEW.status = 'success' AND (OLD.status IS NULL OR OLD.status != 'success') THEN
      -- Daily Recharge
      v_period_key := to_char(NEW.created_at, 'YYYY-MM-DD');
      
      FOR v_task IN SELECT * FROM tasks WHERE condition_type = 'recharge' AND type = 'daily' AND is_active = true LOOP
        INSERT INTO user_task_progress (user_id, task_id, progress, period_key)
        VALUES (NEW.user_id, v_task.id, 1, v_period_key)
        ON CONFLICT (user_id, task_id, period_key)
        DO UPDATE SET progress = user_task_progress.progress + 1, last_updated = NOW();
        
        UPDATE user_task_progress SET is_completed = true 
        WHERE user_id = NEW.user_id AND task_id = v_task.id AND period_key = v_period_key AND progress >= v_task.target_value AND is_completed = false;
      END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_recharge_mission ON recharge_records;
CREATE TRIGGER trigger_recharge_mission
AFTER UPDATE ON recharge_records
FOR EACH ROW
EXECUTE FUNCTION handle_recharge_mission_progress();

-- 9. Update Claim Reward Function (UPDATED to use POINTS)
CREATE OR REPLACE FUNCTION claim_task_reward(p_task_id UUID, p_period_key TEXT)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_task RECORD;
  v_progress RECORD;
BEGIN
  v_user_id := auth.uid();
  
  -- Get Task Info
  SELECT * INTO v_task FROM tasks WHERE id = p_task_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Task not found');
  END IF;

  -- Get Progress Info
  SELECT * INTO v_progress FROM user_task_progress 
  WHERE user_id = v_user_id AND task_id = p_task_id AND period_key = p_period_key;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Progress not found');
  END IF;

  IF v_progress.is_claimed THEN
    RETURN jsonb_build_object('success', false, 'message', 'Already claimed');
  END IF;

  IF NOT v_progress.is_completed THEN
    -- Double check
    IF v_progress.progress >= v_task.target_value THEN
       UPDATE user_task_progress SET is_completed = true WHERE id = v_progress.id;
    ELSE
       RETURN jsonb_build_object('success', false, 'message', 'Not completed yet');
    END IF;
  END IF;

  -- Update Claim Status
  UPDATE user_task_progress 
  SET is_claimed = true, last_updated = NOW() 
  WHERE id = v_progress.id;

  -- Add Reward (POINTS)
  UPDATE users 
  SET points = COALESCE(points, 0) + v_task.reward_coins 
  WHERE id = v_user_id;
  
  RETURN jsonb_build_object('success', true, 'reward', v_task.reward_coins);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Update Daily Check-in (Keep Tokens for Widget, Trigger Login Mission)
CREATE OR REPLACE FUNCTION daily_check_in(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_last_check_in DATE;
    v_consecutive_days INTEGER;
    v_reward INTEGER := 10;
    v_task RECORD;
    v_period_key TEXT;
    v_weekly_logins INT;
BEGIN
    -- Check if already checked in today
    IF EXISTS (SELECT 1 FROM daily_check_ins WHERE user_id = p_user_id AND check_in_date = CURRENT_DATE) THEN
        RETURN jsonb_build_object('success', false, 'message', '今日已簽到');
    END IF;

    -- Insert check-in record
    INSERT INTO daily_check_ins (user_id, check_in_date, reward_amount)
    VALUES (p_user_id, CURRENT_DATE, v_reward);

    -- Update user tokens (Widget Reward)
    UPDATE users SET tokens = COALESCE(tokens, 0) + v_reward WHERE id = p_user_id;

    -- >>> NEW: Trigger Mission Progress (Login) <<<
    -- Daily Login
    v_period_key := to_char(CURRENT_DATE, 'YYYY-MM-DD');
    FOR v_task IN SELECT * FROM tasks WHERE condition_type = 'login' AND type = 'daily' AND is_active = true LOOP
        INSERT INTO user_task_progress (user_id, task_id, progress, period_key)
        VALUES (p_user_id, v_task.id, 1, v_period_key)
        ON CONFLICT (user_id, task_id, period_key) DO UPDATE SET progress = 1, last_updated = NOW();
        
        UPDATE user_task_progress SET is_completed = true WHERE user_id = p_user_id AND task_id = v_task.id AND period_key = v_period_key AND progress >= v_task.target_value;
    END LOOP;

    -- Weekly Login (Count distinct check-ins this week)
    v_period_key := to_char(CURRENT_DATE, 'IYYY-IW');
    
    SELECT COUNT(DISTINCT check_in_date) INTO v_weekly_logins 
    FROM daily_check_ins 
    WHERE user_id = p_user_id 
      AND to_char(check_in_date, 'IYYY-IW') = v_period_key;
      
    FOR v_task IN SELECT * FROM tasks WHERE condition_type = 'login' AND type = 'weekly' AND is_active = true LOOP
        INSERT INTO user_task_progress (user_id, task_id, progress, period_key)
        VALUES (p_user_id, v_task.id, v_weekly_logins, v_period_key)
        ON CONFLICT (user_id, task_id, period_key) DO UPDATE SET progress = v_weekly_logins, last_updated = NOW();
        
        UPDATE user_task_progress SET is_completed = true WHERE user_id = p_user_id AND task_id = v_task.id AND period_key = v_period_key AND progress >= v_task.target_value;
    END LOOP;
    -- <<< End Mission Trigger <<<

    RETURN jsonb_build_object('success', true, 'message', '簽到成功', 'reward', v_reward);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
