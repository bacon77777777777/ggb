-- Lower leaderboard real_count threshold from 10 to 1 so real data shows as soon as any user appears.
-- Also simplifies mock branch to pure placeholder rows (no mixed real+mock confusion).

DROP FUNCTION IF EXISTS public.get_leaderboard_draws(text);

CREATE OR REPLACE FUNCTION public.get_leaderboard_whales(p_range text DEFAULT 'day')
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

  SELECT COUNT(DISTINCT r.user_id) INTO real_count
  FROM recharge_records r
  WHERE r.status = 'success' AND r.created_at >= v_start;

  IF real_count >= 1 THEN
    RETURN QUERY
    SELECT
      ROW_NUMBER() OVER (ORDER BY SUM(r.amount) DESC)::bigint,
      u.id, COALESCE(u.name,'神秘玩家')::text,
      COALESCE(u.avatar_url,'/images/avatar/01.png')::text,
      SUM(r.amount)::numeric,
      NULL::text, NULL::text,
      t.name::text, t.color_key::text
    FROM recharge_records r
    JOIN users u ON u.id = r.user_id
    LEFT JOIN user_titles ut ON ut.user_id = u.id AND ut.is_selected = TRUE
    LEFT JOIN titles t ON t.id = ut.title_id
    WHERE r.status = 'success' AND r.created_at >= v_start
    GROUP BY u.id, u.name, u.avatar_url, t.name, t.color_key
    ORDER BY SUM(r.amount) DESC
    LIMIT 20;
  ELSE
    RETURN QUERY
    WITH slots AS (SELECT generate_series(1,20) AS i)
    SELECT s.i::bigint, NULL::uuid,
      '虛位以待'::text, '/images/avatar/01.png'::text,
      GREATEST(100,(5000-(s.i*200))::numeric),
      NULL::text, NULL::text, NULL::text, NULL::text
    FROM slots s ORDER BY s.i;
  END IF;
END;
$function$;

CREATE FUNCTION public.get_leaderboard_draws(p_range text DEFAULT 'day')
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
  WHERE dr.status = 'success' AND dr.created_at >= v_start;

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
    WHERE dr.status = 'success' AND dr.created_at >= v_start
    GROUP BY u.id, u.name, u.avatar_url, t.name, t.color_key
    ORDER BY COUNT(dr.id) DESC
    LIMIT 20;
  ELSE
    RETURN QUERY
    WITH slots AS (SELECT generate_series(1,20) AS i)
    SELECT s.i::bigint, NULL::uuid,
      '虛位以待'::text, '/images/avatar/01.png'::text,
      GREATEST(100,(5000-(s.i*200))::numeric),
      NULL::text, NULL::text, NULL::text, NULL::text
    FROM slots s ORDER BY s.i;
  END IF;
END;
$function$;
