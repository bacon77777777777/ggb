-- Function to get user missions with current progress
CREATE OR REPLACE FUNCTION get_user_missions()
RETURNS TABLE (
  id UUID,
  type TEXT,
  title TEXT,
  description TEXT,
  target_value INTEGER,
  reward_coins INTEGER,
  condition_type TEXT,
  icon_name TEXT,
  progress INTEGER,
  is_completed BOOLEAN,
  is_claimed BOOLEAN,
  period_key TEXT
) AS $$
DECLARE
  v_user_id UUID;
  v_today TEXT;
  v_week TEXT;
BEGIN
  v_user_id := auth.uid();
  v_today := to_char(NOW(), 'YYYY-MM-DD');
  v_week := to_char(NOW(), 'IYYY-IW');

  RETURN QUERY
  SELECT 
    t.id,
    t.type,
    t.title,
    t.description,
    t.target_value,
    t.reward_coins,
    t.condition_type,
    t.icon_name,
    COALESCE(utp.progress, 0) as progress,
    COALESCE(utp.is_completed, false) as is_completed,
    COALESCE(utp.is_claimed, false) as is_claimed,
    COALESCE(utp.period_key, 
      CASE 
        WHEN t.type = 'daily' THEN v_today
        WHEN t.type = 'weekly' THEN v_week
        ELSE 'ALL'
      END
    ) as period_key
  FROM tasks t
  LEFT JOIN user_task_progress utp ON t.id = utp.task_id AND utp.user_id = v_user_id 
    AND (
      (t.type = 'daily' AND utp.period_key = v_today) OR
      (t.type = 'weekly' AND utp.period_key = v_week) OR
      (t.type = 'achievement' AND utp.period_key = 'ALL')
    )
  WHERE t.is_active = true
  ORDER BY 
    CASE WHEN COALESCE(utp.is_claimed, false) THEN 2 ELSE 0 END, -- Claimed at bottom
    CASE WHEN COALESCE(utp.is_completed, false) THEN 0 ELSE 1 END, -- Completed (unclaimed) at top
    t.type,
    t.reward_coins DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
