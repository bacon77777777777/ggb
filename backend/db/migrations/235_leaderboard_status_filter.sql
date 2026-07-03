-- draw_records 的 status 在新流程下是 in_warehouse / pending_delivery / dismantled
-- 而非舊的 success，所以 count real_count 和排行榜查詢都要移除 status = 'success' 限制

CREATE OR REPLACE FUNCTION public.get_leaderboard_draws(p_range text DEFAULT 'day')
RETURNS TABLE(rank bigint, user_id uuid, nickname text, avatar_url text, total_spent numeric, prize_level text, prize_name text, title_name text, title_color text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_start timestamptz;
  real_count int;
BEGIN
  IF p_range = 'week' THEN
    v_start := DATE_TRUNC('week', NOW() AT TIME ZONE 'Asia/Taipei') AT TIME ZONE 'Asia/Taipei';
  ELSE
    v_start := DATE_TRUNC('day', NOW() AT TIME ZONE 'Asia/Taipei') AT TIME ZONE 'Asia/Taipei';
  END IF;

  SELECT COUNT(DISTINCT dr.user_id) INTO real_count
  FROM draw_records dr
  WHERE dr.created_at >= v_start;

  IF real_count >= 1 THEN
    RETURN QUERY
    SELECT
      ROW_NUMBER() OVER (ORDER BY COUNT(dr.id) DESC)::bigint,
      u.id, COALESCE(u.name,'神秘玩家')::text,
      COALESCE(u.avatar_url,'/images/avatar/01.png')::text,
      COUNT(dr.id)::numeric,
      NULL::text, NULL::text,
      t.name::text, t.color_key::text
    FROM draw_records dr
    JOIN users u ON u.id = dr.user_id
    LEFT JOIN user_titles ut ON ut.user_id = u.id AND ut.is_selected = TRUE
    LEFT JOIN titles t ON t.id = ut.title_id
    WHERE dr.created_at >= v_start
    GROUP BY u.id, u.name, u.avatar_url, t.name, t.color_key
    ORDER BY COUNT(dr.id) DESC
    LIMIT 20;
  ELSE
    RETURN QUERY
    WITH slots AS (SELECT generate_series(1,20) AS i)
    SELECT s.i::bigint, NULL::uuid,
      '虛位以待'::text, '/images/avatar/01.png'::text,
      0::numeric,
      NULL::text, NULL::text, NULL::text, NULL::text
    FROM slots s ORDER BY s.i;
  END IF;
END;
$function$;
