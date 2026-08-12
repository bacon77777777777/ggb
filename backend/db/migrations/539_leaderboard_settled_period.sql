-- 排行榜改看「已結算的上一個區間」
--
-- 日榜 → 昨天整天（台灣時間 00:00 ~ 隔日 00:00）
-- 週榜 → 上週一 00:00 ~ 本週一 00:00
--
-- 為什麼改：
--   1. 原本是即時計算，玩家一抽完就看到自己上榜、名次整天跳動，
--      「今天暫時第一」沒有份量，也不適合拿來發每日獎勵
--   2. 前台底部本來就寫「排行榜數據每日00:00更新／每週一00:00更新」，
--      即時計算等於文案在說謊，現在名實相符
--   3. 機器人分數本來就是按日產生的（leaderboard_bot_daily_stats），
--      跟昨日結算天然吻合
--
-- 同時把 STG 拉齊 PROD：STG 的版本還停在「20 個名字寫死在 SQL 裡、
-- 分數固定不變、真實用戶沒濾 is_bot」的舊實作，本次一併換成新版。

DROP FUNCTION IF EXISTS public.get_leaderboard_draws(text);
CREATE FUNCTION public.get_leaderboard_draws(p_range text DEFAULT 'day'::text)
RETURNS TABLE(rank bigint, user_id uuid, nickname text, avatar_url text, total_spent numeric, prize_level text, prize_name text, title_name text, title_color text)
LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_start      timestamptz;
  v_end        timestamptz;
  v_end_date   DATE;
  v_start_date DATE;
  v_day        DATE;
BEGIN
  /*
   * 榜單看的是「已結算的上一個區間」，不是進行中的這一個。
   *   日榜 → 昨天整天（台灣時間 00:00 ~ 隔日 00:00）
   *   週榜 → 上週一 00:00 ~ 本週一 00:00
   *
   * 改成結算制的理由：即時榜會讓玩家一抽完就看到自己上榜、名次整天跳動，
   * 「今天暫時第一」沒有份量；而且畫面上的小字本來就寫「每日 00:00 更新」，
   * 即時計算等於文案在說謊。機器人分數本來就是按日產生的，跟昨日結算天然吻合。
   */
  IF p_range = 'week' THEN
    v_end   := DATE_TRUNC('week', NOW() AT TIME ZONE 'Asia/Taipei') AT TIME ZONE 'Asia/Taipei';
    v_start := v_end - INTERVAL '7 days';
  ELSE
    v_end   := DATE_TRUNC('day', NOW() AT TIME ZONE 'Asia/Taipei') AT TIME ZONE 'Asia/Taipei';
    v_start := v_end - INTERVAL '1 day';
  END IF;
  v_start_date := v_start::date;
  v_end_date   := (v_end - INTERVAL '1 second')::date;   -- 區間內最後一天

  FOR v_day IN
    SELECT d::date FROM generate_series(v_start_date, v_end_date, '1 day'::interval) AS d
  LOOP
    PERFORM ensure_bot_daily_stats(v_day);
  END LOOP;

  RETURN QUERY
  WITH real AS (
    SELECT
      u.id                                                   AS uid,
      COALESCE(u.name, '神秘玩家')::text                     AS nick,
      COALESCE(u.avatar_url, '/images/avatar/01.png')::text  AS av,
      COUNT(dr.id)::numeric                                  AS score,
      t.name::text                                           AS t_name,
      t.color_key::text                                      AS t_color
    FROM draw_records dr
    JOIN users u ON u.id = dr.user_id
    LEFT JOIN user_titles ut ON ut.user_id = u.id AND ut.is_selected = TRUE
    LEFT JOIN titles t ON t.id = ut.title_id
    WHERE dr.created_at >= v_start
      AND dr.created_at < v_end
      AND COALESCE(dr.prize_level, '') <> 'coin_return'
      AND (u.is_bot = FALSE OR u.is_bot IS NULL)
    GROUP BY u.id, u.name, u.avatar_url, t.name, t.color_key
  ),
  bots AS (
    SELECT
      u.id                                                   AS uid,
      COALESCE(u.name, '神秘玩家')::text                     AS nick,
      COALESCE(u.avatar_url, '/images/avatar/01.png')::text  AS av,
      SUM(bs.draws_score)::numeric                           AS score,
      t.name::text                                           AS t_name,
      t.color_key::text                                      AS t_color
    FROM leaderboard_bot_daily_stats bs
    JOIN users u ON u.id = bs.user_id
    LEFT JOIN user_titles ut ON ut.user_id = u.id AND ut.is_selected = TRUE
    LEFT JOIN titles t ON t.id = ut.title_id
    WHERE bs.date >= v_start_date
      AND bs.date <= v_end_date
      AND u.is_bot = TRUE
    GROUP BY u.id, u.name, u.avatar_url, t.name, t.color_key
  ),
  combined AS (
    SELECT uid, nick, av, score, t_name, t_color FROM real
    UNION ALL
    SELECT uid, nick, av, score, t_name, t_color FROM bots
  )
  SELECT
    ROW_NUMBER() OVER (ORDER BY score DESC)::bigint,
    uid, nick, av, score,
    NULL::text, NULL::text,
    t_name, t_color
  FROM combined
  ORDER BY score DESC
  LIMIT 20;
END;
$fn$;

DROP FUNCTION IF EXISTS public.get_leaderboard_whales(text);
CREATE FUNCTION public.get_leaderboard_whales(p_range text DEFAULT 'day'::text)
RETURNS TABLE(rank bigint, user_id uuid, nickname text, avatar_url text, total_spent numeric, prize_level text, prize_name text, title_name text, title_color text)
LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_start      timestamptz;
  v_end        timestamptz;
  v_end_date   DATE;
  v_start_date DATE;
  v_day        DATE;
BEGIN
  /*
   * 榜單看的是「已結算的上一個區間」，不是進行中的這一個。
   *   日榜 → 昨天整天（台灣時間 00:00 ~ 隔日 00:00）
   *   週榜 → 上週一 00:00 ~ 本週一 00:00
   *
   * 改成結算制的理由：即時榜會讓玩家一抽完就看到自己上榜、名次整天跳動，
   * 「今天暫時第一」沒有份量；而且畫面上的小字本來就寫「每日 00:00 更新」，
   * 即時計算等於文案在說謊。機器人分數本來就是按日產生的，跟昨日結算天然吻合。
   */
  IF p_range = 'week' THEN
    v_end   := DATE_TRUNC('week', NOW() AT TIME ZONE 'Asia/Taipei') AT TIME ZONE 'Asia/Taipei';
    v_start := v_end - INTERVAL '7 days';
  ELSE
    v_end   := DATE_TRUNC('day', NOW() AT TIME ZONE 'Asia/Taipei') AT TIME ZONE 'Asia/Taipei';
    v_start := v_end - INTERVAL '1 day';
  END IF;
  v_start_date := v_start::date;
  v_end_date   := (v_end - INTERVAL '1 second')::date;   -- 區間內最後一天

  FOR v_day IN
    SELECT d::date FROM generate_series(v_start_date, v_end_date, '1 day'::interval) AS d
  LOOP
    PERFORM ensure_bot_daily_stats(v_day);
  END LOOP;

  RETURN QUERY
  WITH real AS (
    -- 真實用戶消費代幣 = 抽到的商品價格加總
    SELECT
      u.id                                                   AS uid,
      COALESCE(u.name, '神秘玩家')::text                     AS nick,
      COALESCE(u.avatar_url, '/images/avatar/01.png')::text  AS av,
      SUM(p.price)::numeric                                  AS score,
      t.name::text                                           AS t_name,
      t.color_key::text                                      AS t_color
    FROM draw_records dr
    JOIN users u ON u.id = dr.user_id
    JOIN products p ON p.id = dr.product_id
    LEFT JOIN user_titles ut ON ut.user_id = u.id AND ut.is_selected = TRUE
    LEFT JOIN titles t ON t.id = ut.title_id
    WHERE dr.created_at >= v_start
      AND dr.created_at < v_end
      AND (u.is_bot = FALSE OR u.is_bot IS NULL)
    GROUP BY u.id, u.name, u.avatar_url, t.name, t.color_key
  ),
  bots AS (
    SELECT
      u.id                                                   AS uid,
      COALESCE(u.name, '神秘玩家')::text                     AS nick,
      COALESCE(u.avatar_url, '/images/avatar/01.png')::text  AS av,
      SUM(bs.whale_score)::numeric                           AS score,
      t.name::text                                           AS t_name,
      t.color_key::text                                      AS t_color
    FROM leaderboard_bot_daily_stats bs
    JOIN users u ON u.id = bs.user_id
    LEFT JOIN user_titles ut ON ut.user_id = u.id AND ut.is_selected = TRUE
    LEFT JOIN titles t ON t.id = ut.title_id
    WHERE bs.date >= v_start_date
      AND bs.date <= v_end_date
      AND u.is_bot = TRUE
    GROUP BY u.id, u.name, u.avatar_url, t.name, t.color_key
  ),
  combined AS (
    SELECT uid, nick, av, score, t_name, t_color FROM real
    UNION ALL
    SELECT uid, nick, av, score, t_name, t_color FROM bots
  )
  SELECT
    ROW_NUMBER() OVER (ORDER BY score DESC)::bigint,
    uid, nick, av, score,
    NULL::text, NULL::text,
    t_name, t_color
  FROM combined
  ORDER BY score DESC
  LIMIT 20;
END;
$fn$;

-- DROP 會一併帶走授權，補回來（前台用 anon / authenticated 呼叫）
GRANT EXECUTE ON FUNCTION public.get_leaderboard_draws(text)  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_whales(text) TO anon, authenticated, service_role;
