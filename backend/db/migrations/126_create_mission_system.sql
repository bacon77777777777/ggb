-- Create Mission System Tables

-- 1. Tasks Definition Table
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('daily', 'weekly', 'achievement')),
  title TEXT NOT NULL,
  description TEXT,
  target_value INTEGER NOT NULL DEFAULT 1,
  reward_coins INTEGER NOT NULL DEFAULT 0,
  condition_type TEXT NOT NULL CHECK (condition_type IN ('login', 'draw_count', 'spend_amount', 'share_app')),
  icon_name TEXT, -- Matches Lucide icon names (e.g., 'Ticket', 'Share', 'Trophy')
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. User Task Progress Table
CREATE TABLE IF NOT EXISTS public.user_task_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  progress INTEGER DEFAULT 0,
  is_completed BOOLEAN DEFAULT false,
  is_claimed BOOLEAN DEFAULT false,
  period_key TEXT NOT NULL, -- e.g., '2023-10-27' for daily, '2023-W43' for weekly, 'ALL' for achievement
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_task_period UNIQUE (user_id, task_id, period_key)
);

-- 3. Enable RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_task_progress ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
-- Tasks are public read
DROP POLICY IF EXISTS "Tasks are viewable by everyone" ON public.tasks;
CREATE POLICY "Tasks are viewable by everyone" ON public.tasks FOR SELECT USING (true);

-- User Progress: Users can view their own progress
DROP POLICY IF EXISTS "Users can view own progress" ON public.user_task_progress;
CREATE POLICY "Users can view own progress" ON public.user_task_progress FOR SELECT USING (auth.uid() = user_id);

-- User Progress: Users can insert/update their own progress (for frontend tracking like 'share')
DROP POLICY IF EXISTS "Users can update own progress" ON public.user_task_progress;
CREATE POLICY "Users can update own progress" ON public.user_task_progress FOR ALL USING (auth.uid() = user_id);

-- 5. Helper Function: Claim Reward
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
    -- Double check if progress meets target (in case trigger missed it)
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

  -- Add Reward (Update 'points' instead of 'tokens' as per user requirement)
  UPDATE users 
  SET points = COALESCE(points, 0) + v_task.reward_coins 
  WHERE id = v_user_id;
  
  RETURN jsonb_build_object('success', true, 'reward', v_task.reward_coins);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 6. Trigger for Draw Counts
CREATE OR REPLACE FUNCTION handle_new_draw_mission_progress()
RETURNS TRIGGER AS $$
DECLARE
  v_task RECORD;
  v_period_key TEXT;
BEGIN
  -- 1. Daily Tasks (draw_count)
  v_period_key := to_char(NEW.created_at, 'YYYY-MM-DD');
  
  FOR v_task IN SELECT * FROM tasks WHERE condition_type = 'draw_count' AND type = 'daily' AND is_active = true LOOP
    INSERT INTO user_task_progress (user_id, task_id, progress, period_key)
    VALUES (NEW.user_id, v_task.id, 1, v_period_key)
    ON CONFLICT (user_id, task_id, period_key)
    DO UPDATE SET 
      progress = user_task_progress.progress + 1,
      last_updated = NOW();
      
    -- Check completion
    UPDATE user_task_progress 
    SET is_completed = true 
    WHERE user_id = NEW.user_id 
      AND task_id = v_task.id 
      AND period_key = v_period_key 
      AND progress >= v_task.target_value 
      AND is_completed = false;
  END LOOP;

  -- 2. Weekly Tasks
  v_period_key := to_char(NEW.created_at, 'IYYY-IW'); -- ISO Week
  
  FOR v_task IN SELECT * FROM tasks WHERE condition_type = 'draw_count' AND type = 'weekly' AND is_active = true LOOP
    INSERT INTO user_task_progress (user_id, task_id, progress, period_key)
    VALUES (NEW.user_id, v_task.id, 1, v_period_key)
    ON CONFLICT (user_id, task_id, period_key)
    DO UPDATE SET 
      progress = user_task_progress.progress + 1,
      last_updated = NOW();
      
    UPDATE user_task_progress 
    SET is_completed = true 
    WHERE user_id = NEW.user_id 
      AND task_id = v_task.id 
      AND period_key = v_period_key 
      AND progress >= v_task.target_value 
      AND is_completed = false;
  END LOOP;

  -- 3. Achievement (All time)
  v_period_key := 'ALL';
  
  FOR v_task IN SELECT * FROM tasks WHERE condition_type = 'draw_count' AND type = 'achievement' AND is_active = true LOOP
    INSERT INTO user_task_progress (user_id, task_id, progress, period_key)
    VALUES (NEW.user_id, v_task.id, 1, v_period_key)
    ON CONFLICT (user_id, task_id, period_key)
    DO UPDATE SET 
      progress = user_task_progress.progress + 1,
      last_updated = NOW();
      
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

DROP TRIGGER IF EXISTS trigger_draw_mission ON draw_records;
CREATE TRIGGER trigger_draw_mission
AFTER INSERT ON draw_records
FOR EACH ROW
EXECUTE FUNCTION handle_new_draw_mission_progress();

-- 7. Seed Initial Data
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.tasks WHERE title = '每日首抽') THEN
        INSERT INTO public.tasks (type, title, description, target_value, reward_coins, condition_type, icon_name)
        VALUES ('daily', '每日首抽', '每日完成 1 次抽獎', 1, 50, 'draw_count', 'Ticket');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.tasks WHERE title = '每日分享') THEN
        INSERT INTO public.tasks (type, title, description, target_value, reward_coins, condition_type, icon_name)
        VALUES ('daily', '每日分享', '每日分享一次連結', 1, 10, 'share_app', 'Share');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.tasks WHERE title = '每週十連') THEN
        INSERT INTO public.tasks (type, title, description, target_value, reward_coins, condition_type, icon_name)
        VALUES ('weekly', '每週十連', '每週累積抽獎 10 次', 10, 200, 'draw_count', 'Layers');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.tasks WHERE title = '新手上路') THEN
        INSERT INTO public.tasks (type, title, description, target_value, reward_coins, condition_type, icon_name)
        VALUES ('achievement', '新手上路', '累積完成 5 次抽獎', 5, 100, 'draw_count', 'Trophy');
    END IF;
END $$;
