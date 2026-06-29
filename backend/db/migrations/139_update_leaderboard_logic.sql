-- 更新排行榜函數邏輯
-- 修正：先 DROP 舊函數以避免回傳型別衝突 (ERROR: 42P13)

-- 1. 歐皇榜 (Lucky): 大賞數量最多 (每週一更新)
DROP FUNCTION IF EXISTS get_leaderboard_lucky(text);

CREATE OR REPLACE FUNCTION get_leaderboard_lucky(p_range TEXT DEFAULT 'week')
RETURNS TABLE (
  user_id UUID,
  nickname TEXT,
  avatar_url TEXT,
  big_prize_count BIGINT,
  rank BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id, 
    COALESCE(u.name, '神秘玩家') as nickname, 
    (au.raw_user_meta_data->>'avatar_url')::TEXT as avatar_url,
    COUNT(*) as big_prize_count,
    RANK() OVER (ORDER BY COUNT(*) DESC) as rank
  FROM draw_records d
  JOIN products p ON d.product_id = p.id
  JOIN users u ON d.user_id = u.id
  JOIN auth.users au ON u.id = au.id
  WHERE 
    (
      CASE 
        -- 日榜：顯示昨日數據 (昨天 00:00:00 ~ 昨天 23:59:59)
        WHEN p_range = 'day' THEN 
          d.created_at >= date_trunc('day', NOW() - INTERVAL '1 day') AND
          d.created_at < date_trunc('day', NOW())
          
        -- 週榜：顯示上週數據 (上週一 00:00:00 ~ 上週日 23:59:59)
        WHEN p_range = 'week' THEN 
          d.created_at >= date_trunc('week', NOW() - INTERVAL '1 week') AND
          d.created_at < date_trunc('week', NOW())
          
        -- 月榜：維持顯示本月 (或者依照需求改成上個月？這裡先維持本月，若需改成上個月請告知)
        -- 假設月榜也是即時更新本月數據
        WHEN p_range = 'month' THEN d.created_at >= date_trunc('month', NOW())
        ELSE TRUE
      END
    )
    AND d.prize_level = ANY(p.major_prizes)
  GROUP BY u.id, u.name, au.raw_user_meta_data
  ORDER BY big_prize_count DESC
  LIMIT 10;
END;
$$;

-- 2. 非酋榜 (Unlucky): 大賞佔比最低 (每月一號更新)
DROP FUNCTION IF EXISTS get_leaderboard_unlucky(text);

CREATE OR REPLACE FUNCTION get_leaderboard_unlucky(p_range TEXT DEFAULT 'month')
RETURNS TABLE (
  user_id UUID,
  nickname TEXT,
  avatar_url TEXT,
  grand_prize_count BIGINT,
  total_draws BIGINT,
  grand_prize_rate NUMERIC,
  rank BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id, 
    COALESCE(u.name, '神秘玩家') as nickname, 
    (au.raw_user_meta_data->>'avatar_url')::TEXT as avatar_url,
    COUNT(*) FILTER (WHERE d.prize_level = ANY(p.major_prizes)) as grand_prize_count,
    COUNT(*) as total_draws,
    ROUND((COUNT(*) FILTER (WHERE d.prize_level = ANY(p.major_prizes))::numeric / NULLIF(COUNT(*), 0)) * 100, 2) as grand_prize_rate,
    RANK() OVER (ORDER BY (COUNT(*) FILTER (WHERE d.prize_level = ANY(p.major_prizes))::numeric / NULLIF(COUNT(*), 0)) ASC, COUNT(*) DESC) as rank
  FROM draw_records d
  JOIN products p ON d.product_id = p.id
  JOIN users u ON d.user_id = u.id
  JOIN auth.users au ON u.id = au.id
  WHERE 
    CASE 
      -- 日榜：顯示昨日數據 (昨天 00:00:00 ~ 昨天 23:59:59)
      WHEN p_range = 'day' THEN 
        d.created_at >= date_trunc('day', NOW() - INTERVAL '1 day') AND
        d.created_at < date_trunc('day', NOW())
        
      -- 週榜：顯示上週數據 (上週一 00:00:00 ~ 上週日 23:59:59)
      WHEN p_range = 'week' THEN 
        d.created_at >= date_trunc('week', NOW() - INTERVAL '1 week') AND
        d.created_at < date_trunc('week', NOW())
        
      -- 月榜：維持顯示本月
      WHEN p_range = 'month' THEN d.created_at >= date_trunc('month', NOW())
      ELSE TRUE
    END
  GROUP BY u.id, u.name, au.raw_user_meta_data
  HAVING COUNT(*) >= 10 -- 門檻：至少抽 10 次才列入計算
  ORDER BY grand_prize_rate ASC, total_draws DESC
  LIMIT 10;
END;
$$;

-- 3. 賞金榜 (Whales): 消耗代幣最多 (支援日榜)
DROP FUNCTION IF EXISTS get_leaderboard_whales(text);

CREATE OR REPLACE FUNCTION get_leaderboard_whales(p_range TEXT DEFAULT 'week')
RETURNS TABLE (
  user_id UUID,
  nickname TEXT,
  avatar_url TEXT,
  total_spent NUMERIC,
  rank BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id, 
    COALESCE(u.name, '神秘玩家') as nickname, 
    (au.raw_user_meta_data->>'avatar_url')::TEXT as avatar_url,
    SUM(p.price) as total_spent,
    RANK() OVER (ORDER BY SUM(p.price) DESC) as rank
  FROM draw_records d
  JOIN products p ON d.product_id = p.id
  JOIN users u ON d.user_id = u.id
  JOIN auth.users au ON u.id = au.id
  WHERE 
    CASE 
      -- 日榜：顯示昨日數據 (昨天 00:00:00 ~ 昨天 23:59:59)
      WHEN p_range = 'day' THEN 
        d.created_at >= date_trunc('day', NOW() - INTERVAL '1 day') AND
        d.created_at < date_trunc('day', NOW())
        
      -- 週榜：顯示上週數據 (上週一 00:00:00 ~ 上週日 23:59:59)
      WHEN p_range = 'week' THEN 
        d.created_at >= date_trunc('week', NOW() - INTERVAL '1 week') AND
        d.created_at < date_trunc('week', NOW())
        
      -- 月榜：維持顯示本月
      WHEN p_range = 'month' THEN d.created_at >= date_trunc('month', NOW())
      ELSE TRUE
    END
  GROUP BY u.id, u.name, au.raw_user_meta_data
  ORDER BY total_spent DESC
  LIMIT 10;
END;
$$;
