-- 機器人的累積數字每天緩慢長大
--
-- 問題：排行榜的「今日分數」本來就每天不同（ensure_bot_daily_stats 按日產生），
-- 但玩家點進資料小卡看到的「累積抽獎次數」與「膜拜次數」是死的 ——
-- users.total_draws 是一次性寫入後就沒東西會累加，worship_logs 只有真人膜拜
-- 才會增加，而真實用戶沒幾個。同一個機器人連看一個月數字都不動，一眼假。
--
-- 作法：每天把「當日排行榜分數」累加進 total_draws / total_spent，
-- 並讓機器人之間互相膜拜。數字實際寫進資料庫，前後台看到的都一致。
--
-- ── 冪等怎麼保證
-- bot_growth_log 一天一列。已經處理過的日期直接跳過，所以重複呼叫、
-- 補算歷史都不會重複加。
--
-- ── 為什麼不用 pg_cron
-- STG 沒有 pg_cron（PROD 才有），排程只會有一邊在動，兩環境數字會分岔。
-- 改成跟 ensure_bot_daily_stats 同一套：查詢排行榜時順手補算，
-- 沒人看的日子等有人看再補，補得完整且兩邊行為一致。

CREATE TABLE IF NOT EXISTS bot_growth_log (
  date            DATE PRIMARY KEY,
  bots_updated    INT,
  worships_added  INT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE bot_growth_log IS
  '機器人假數據的成長記錄，一天一列。用來保證 grow_bot_stats 冪等（migration 547）';

CREATE OR REPLACE FUNCTION public.grow_bot_stats(p_date DATE)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_bots INT := 0;
  v_wor  INT := 0;
BEGIN
  IF p_date IS NULL OR p_date > CURRENT_DATE THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM bot_growth_log WHERE date = p_date) THEN RETURN; END IF;

  -- 當日分數要先在，才有東西可以累加
  PERFORM ensure_bot_daily_stats(p_date);

  -- 1) 累積抽獎次數與消費額 += 當日排行榜分數
  --    直接沿用排行榜那組數字，兩邊才不會各講各的
  WITH upd AS (
    UPDATE users u
    SET total_draws = COALESCE(u.total_draws, 0) + s.draws_score,
        total_spent = COALESCE(u.total_spent, 0) + s.whale_score
    FROM leaderboard_bot_daily_stats s
    WHERE s.user_id = u.id AND s.date = p_date AND u.is_bot = TRUE
    RETURNING 1
  ) SELECT count(*) INTO v_bots FROM upd;

  -- 2) 機器人互相膜拜
  --    worship_logs 有 (worshipper_id, worship_date) 唯一索引 —— 一個帳號一天
  --    只能膜拜一次，天然限流，不會爆量。約三分之一的機器人當天會出手，
  --    對象偏向當日分數高的（跟真人「膜拜大神」的行為一致）。
  WITH ranked AS (
    SELECT s.user_id, s.draws_score,
           ROW_NUMBER() OVER (ORDER BY s.draws_score DESC) AS rn,
           (EXTRACT(EPOCH FROM u.created_at)::bigint % 97) AS seed
    FROM leaderboard_bot_daily_stats s
    JOIN users u ON u.id = s.user_id AND u.is_bot = TRUE
    WHERE s.date = p_date
  ),
  top_targets AS (SELECT user_id, rn FROM ranked WHERE rn <= 30),
  worshippers AS (
    SELECT user_id, seed FROM ranked
    WHERE (EXTRACT(DOY FROM p_date)::int + seed) % 3 = 0
  ),
  ins AS (
    INSERT INTO worship_logs (worshipper_id, target_id, worship_date)
    SELECT w.user_id, t.user_id, p_date
    FROM worshippers w
    JOIN top_targets t
      ON t.rn = 1 + ((EXTRACT(DOY FROM p_date)::int * 7 + w.seed * 13) % 30)
    WHERE w.user_id <> t.user_id          -- 不能膜拜自己
    ON CONFLICT DO NOTHING
    RETURNING 1
  ) SELECT count(*) INTO v_wor FROM ins;

  INSERT INTO bot_growth_log (date, bots_updated, worships_added)
  VALUES (p_date, v_bots, v_wor)
  ON CONFLICT (date) DO NOTHING;
END;
$fn$;

/**
 * 從上次處理的隔天補算到指定日期。
 * 最多回補 30 天 —— 久沒人看時避免一次跑幾百天。
 */
CREATE OR REPLACE FUNCTION public.grow_bot_stats_through(p_until DATE)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_from DATE;
  v_day  DATE;
BEGIN
  SELECT COALESCE(MAX(date) + 1, p_until) INTO v_from FROM bot_growth_log;
  v_from := GREATEST(v_from, p_until - 30);
  FOR v_day IN SELECT d::date FROM generate_series(v_from, p_until, '1 day'::interval) AS d LOOP
    PERFORM grow_bot_stats(v_day);
  END LOOP;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.grow_bot_stats(DATE)         TO service_role;
GRANT EXECUTE ON FUNCTION public.grow_bot_stats_through(DATE) TO anon, authenticated, service_role;

-- ── 掛進排行榜查詢，讓成長跟著被看到的時候發生 ──────────────────────
CREATE OR REPLACE FUNCTION public.get_leaderboard_draws(p_range text DEFAULT 'day'::text)
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

  -- 順手把機器人的累積數字補到昨天（冪等，見 migration 547）。
  -- 掛在這裡是因為排行榜是機器人最常被看到的地方，有人看就有人幫它們長大；
  -- 沒有 pg_cron 的環境（STG）也照樣會動。
  PERFORM grow_bot_stats_through(v_end_date);

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
