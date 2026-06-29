-- Fix Mission System Points (Switch from tokens to points)

-- 1. Fix claim_task_reward to update points
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

  -- Add Reward (Update 'points' instead of 'tokens')
  UPDATE users 
  SET points = COALESCE(points, 0) + v_task.reward_coins 
  WHERE id = v_user_id;
  
  RETURN jsonb_build_object('success', true, 'reward', v_task.reward_coins);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Fix daily_check_in to update points
CREATE OR REPLACE FUNCTION daily_check_in(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_streak INTEGER := 0;
    v_reward INTEGER;
    v_today DATE := CURRENT_DATE;
    v_check_date DATE;
BEGIN
    IF EXISTS(SELECT 1 FROM daily_check_ins WHERE user_id = p_user_id AND check_in_date = v_today) THEN
        RETURN jsonb_build_object('success', false, 'message', '今日已簽到');
    END IF;

    -- Calculate streak (from yesterday backwards)
    v_check_date := v_today - 1;
    LOOP
        PERFORM 1 FROM daily_check_ins WHERE user_id = p_user_id AND check_in_date = v_check_date;
        IF FOUND THEN
            v_streak := v_streak + 1;
            v_check_date := v_check_date - 1;
        ELSE
            EXIT;
        END IF;
    END LOOP;

    -- Calculate reward: 10 + (streak % 7) * 5
    -- Day 1 (streak 0): 10
    -- Day 2 (streak 1): 15
    -- ...
    v_reward := 10 + (v_streak % 7) * 5;

    INSERT INTO daily_check_ins (user_id, check_in_date, reward_amount)
    VALUES (p_user_id, v_today, v_reward);

    -- Update users POINTS (not tokens)
    UPDATE users SET points = COALESCE(points, 0) + v_reward WHERE id = p_user_id;

    RETURN jsonb_build_object(
        'success', true, 
        'reward', v_reward,
        'streak', v_streak + 1
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
