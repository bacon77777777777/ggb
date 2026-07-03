-- Leaderboard always shows 20 entries: real users first (sorted by score),
-- then bot users fill remaining slots. Bots are visual-only — no real records.

CREATE OR REPLACE FUNCTION public.get_leaderboard_whales(p_range text DEFAULT 'day')
RETURNS TABLE(rank bigint, user_id uuid, nickname text, avatar_url text, total_spent numeric, prize_level text, prize_name text, title_name text, title_color text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_start timestamptz;
BEGIN
  IF p_range = 'week' THEN
    v_start := DATE_TRUNC('week', NOW() AT TIME ZONE 'Asia/Taipei') AT TIME ZONE 'Asia/Taipei';
  ELSE
    v_start := DATE_TRUNC('day', NOW() AT TIME ZONE 'Asia/Taipei') AT TIME ZONE 'Asia/Taipei';
  END IF;

  RETURN QUERY
  WITH real AS (
    SELECT
      u.id AS uid,
      COALESCE(u.name,'神秘玩家')::text AS nick,
      COALESCE(u.avatar_url,'/images/avatar/01.png')::text AS av,
      SUM(r.amount)::numeric AS score,
      t.name::text AS t_name,
      t.color_key::text AS t_color,
      0 AS is_bot
    FROM recharge_records r
    JOIN users u ON u.id = r.user_id
    LEFT JOIN user_titles ut ON ut.user_id = u.id AND ut.is_selected = TRUE
    LEFT JOIN titles t ON t.id = ut.title_id
    WHERE r.status = 'success' AND r.created_at >= v_start
    GROUP BY u.id, u.name, u.avatar_url, t.name, t.color_key
  ),
  bots(nick, av, score) AS (VALUES
    ('龍騎士Ω',   '/images/avatar/01.png', 4800::numeric),
    ('轉蛋狂魔',  '/images/avatar/02.png', 4200::numeric),
    ('命運之子',  '/images/avatar/03.png', 3700::numeric),
    ('夜の魔王',  '/images/avatar/04.png', 3200::numeric),
    ('幸運女神',  '/images/avatar/05.png', 2800::numeric),
    ('抽蛋達人',  '/images/avatar/06.png', 2400::numeric),
    ('無盡抽手',  '/images/avatar/07.png', 2100::numeric),
    ('轉蛋人生',  '/images/avatar/08.png', 1800::numeric),
    ('黑夜騎士',  '/images/avatar/09.png', 1600::numeric),
    ('爆發力王',  '/images/avatar/10.png', 1400::numeric),
    ('銀翼獵手',  '/images/avatar/01.png', 1200::numeric),
    ('天空行者',  '/images/avatar/02.png', 1000::numeric),
    ('赤焰使者',  '/images/avatar/03.png',  850::numeric),
    ('戰神歸來',  '/images/avatar/04.png',  700::numeric),
    ('暗影鬥士',  '/images/avatar/05.png',  580::numeric),
    ('鋒芒初露',  '/images/avatar/06.png',  460::numeric),
    ('新生勇者',  '/images/avatar/07.png',  360::numeric),
    ('小試牛刀',  '/images/avatar/08.png',  270::numeric),
    ('初心玩家',  '/images/avatar/09.png',  180::numeric),
    ('剛入門者',  '/images/avatar/10.png',  100::numeric)
  ),
  bots_ranked AS (
    SELECT nick, av, score,
           ROW_NUMBER() OVER (ORDER BY score DESC)::int AS bot_rank
    FROM bots
  ),
  real_count AS (SELECT COUNT(*)::int AS n FROM real),
  filled AS (
    SELECT uid, nick, av, score, t_name, t_color, is_bot FROM real
    UNION ALL
    SELECT NULL::uuid, br.nick, br.av, br.score, NULL::text, NULL::text, 1
    FROM bots_ranked br
    CROSS JOIN real_count rc
    WHERE br.bot_rank <= GREATEST(0, 20 - rc.n)
  )
  SELECT
    ROW_NUMBER() OVER (ORDER BY is_bot ASC, score DESC)::bigint,
    uid, nick, av, score,
    NULL::text, NULL::text, t_name, t_color
  FROM filled
  ORDER BY is_bot ASC, score DESC
  LIMIT 20;
END;
$function$;

DROP FUNCTION IF EXISTS public.get_leaderboard_draws(text);

CREATE FUNCTION public.get_leaderboard_draws(p_range text DEFAULT 'day')
RETURNS TABLE(rank bigint, user_id uuid, nickname text, avatar_url text, total_spent numeric, prize_level text, prize_name text, title_name text, title_color text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_start timestamptz;
BEGIN
  IF p_range = 'week' THEN
    v_start := DATE_TRUNC('week', NOW() AT TIME ZONE 'Asia/Taipei') AT TIME ZONE 'Asia/Taipei';
  ELSE
    v_start := DATE_TRUNC('day', NOW() AT TIME ZONE 'Asia/Taipei') AT TIME ZONE 'Asia/Taipei';
  END IF;

  RETURN QUERY
  WITH real AS (
    SELECT
      u.id AS uid,
      COALESCE(u.name,'神秘玩家')::text AS nick,
      COALESCE(u.avatar_url,'/images/avatar/01.png')::text AS av,
      COUNT(dr.id)::numeric AS score,
      t.name::text AS t_name,
      t.color_key::text AS t_color,
      0 AS is_bot
    FROM draw_records dr
    JOIN users u ON u.id = dr.user_id
    LEFT JOIN user_titles ut ON ut.user_id = u.id AND ut.is_selected = TRUE
    LEFT JOIN titles t ON t.id = ut.title_id
    WHERE dr.created_at >= v_start
    GROUP BY u.id, u.name, u.avatar_url, t.name, t.color_key
  ),
  bots(nick, av, score) AS (VALUES
    ('龍騎士Ω',   '/images/avatar/01.png', 88::numeric),
    ('轉蛋狂魔',  '/images/avatar/02.png', 75::numeric),
    ('命運之子',  '/images/avatar/03.png', 63::numeric),
    ('夜の魔王',  '/images/avatar/04.png', 55::numeric),
    ('幸運女神',  '/images/avatar/05.png', 48::numeric),
    ('抽蛋達人',  '/images/avatar/06.png', 42::numeric),
    ('無盡抽手',  '/images/avatar/07.png', 36::numeric),
    ('轉蛋人生',  '/images/avatar/08.png', 31::numeric),
    ('黑夜騎士',  '/images/avatar/09.png', 27::numeric),
    ('爆發力王',  '/images/avatar/10.png', 23::numeric),
    ('銀翼獵手',  '/images/avatar/01.png', 20::numeric),
    ('天空行者',  '/images/avatar/02.png', 17::numeric),
    ('赤焰使者',  '/images/avatar/03.png', 15::numeric),
    ('戰神歸來',  '/images/avatar/04.png', 13::numeric),
    ('暗影鬥士',  '/images/avatar/05.png', 11::numeric),
    ('鋒芒初露',  '/images/avatar/06.png',  9::numeric),
    ('新生勇者',  '/images/avatar/07.png',  8::numeric),
    ('小試牛刀',  '/images/avatar/08.png',  6::numeric),
    ('初心玩家',  '/images/avatar/09.png',  5::numeric),
    ('剛入門者',  '/images/avatar/10.png',  3::numeric)
  ),
  bots_ranked AS (
    SELECT nick, av, score,
           ROW_NUMBER() OVER (ORDER BY score DESC)::int AS bot_rank
    FROM bots
  ),
  real_count AS (SELECT COUNT(*)::int AS n FROM real),
  filled AS (
    SELECT uid, nick, av, score, t_name, t_color, is_bot FROM real
    UNION ALL
    SELECT NULL::uuid, br.nick, br.av, br.score, NULL::text, NULL::text, 1
    FROM bots_ranked br
    CROSS JOIN real_count rc
    WHERE br.bot_rank <= GREATEST(0, 20 - rc.n)
  )
  SELECT
    ROW_NUMBER() OVER (ORDER BY is_bot ASC, score DESC)::bigint,
    uid, nick, av, score,
    NULL::text, NULL::text, t_name, t_color
  FROM filled
  ORDER BY is_bot ASC, score DESC
  LIMIT 20;
END;
$function$;
