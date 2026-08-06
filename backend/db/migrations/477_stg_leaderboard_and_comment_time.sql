-- 477: STG 補上排行榜的機器人日分數，並修正留言時間早於文章
--
-- ── 一、STG 的日榜是空的 ──
-- 老闆回報 STG 排行日榜沒有機器人。查下來不是資料沒補，是
-- `leaderboard_bot_daily_stats` 這張表和 `ensure_bot_daily_stats` 這支函數
-- **在 STG 根本不存在**。PROD 有，STG 沒有 —— 又一次環境漂移。
--
-- get_leaderboard_draws 會呼叫 ensure_bot_daily_stats 補當日分數，
-- 函數不存在時整個排行榜查詢會失敗或退回只有真實玩家的結果。
--
-- ── 二、35% 的留言時間早於文章 ──
-- seed_bot_engagement_for_article 的留言時間是 `NOW() - RANDOM()*36h`，
-- 但文章可能是一小時前才發的 —— 於是出現「文章發布 1 小時前就有人留言」。
-- 實測 PROD：7066 則留言裡有 2467 則（35%）比文章還早。
-- 改成以文章發布時間為下界。

CREATE OR REPLACE FUNCTION public.ensure_bot_daily_stats(p_date date DEFAULT CURRENT_DATE)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO leaderboard_bot_daily_stats (user_id, date, draws_score, whale_score)
  WITH ranked_bots AS (
    SELECT
      id,
      ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn,
      (EXTRACT(EPOCH FROM created_at)::bigint % 97) AS user_seed
    FROM users WHERE is_bot = TRUE
  )
  SELECT
    rb.id,
    p_date,
    -- 抽蛋數（不變）
    GREATEST(1, ROUND(
      88.0 * POWER(0.97, rb.rn - 1) *
      (0.70 + 0.30 * ((EXTRACT(DOY FROM p_date)::int * 7 + rb.user_seed * 11) % 100)::numeric / 100.0)
    ))::int,
    -- 消費G = draws_score * 平均約 150G（帶同樣每日變化）
    GREATEST(100, ROUND(
      88.0 * POWER(0.97, rb.rn - 1) * 150.0 *
      (0.70 + 0.30 * ((EXTRACT(DOY FROM p_date)::int * 13 + rb.user_seed * 7) % 100)::numeric / 100.0)
    ))::int
  FROM ranked_bots rb
  ON CONFLICT (user_id, date) DO NOTHING;
END;
$function$

;

-- 表
CREATE TABLE IF NOT EXISTS leaderboard_bot_daily_stats (
  id          SERIAL PRIMARY KEY,
  user_id     UUID NOT NULL,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  draws_score INTEGER NOT NULL DEFAULT 0,
  whale_score INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, date)
);
CREATE INDEX IF NOT EXISTS idx_bot_daily_stats_date      ON leaderboard_bot_daily_stats (date);
CREATE INDEX IF NOT EXISTS idx_bot_daily_stats_user_date ON leaderboard_bot_daily_stats (user_id, date);

ALTER TABLE leaderboard_bot_daily_stats ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='leaderboard_bot_daily_stats' AND policyname='lbds_read') THEN
    -- 排行榜是公開資訊，前台要讀得到
    CREATE POLICY lbds_read ON leaderboard_bot_daily_stats FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

-- 補今天與前 6 天，日榜週榜都要有東西
DO $$
DECLARE d DATE;
BEGIN
  FOR d IN SELECT generate_series(CURRENT_DATE - 6, CURRENT_DATE, '1 day'::interval)::date LOOP
    PERFORM ensure_bot_daily_stats(d);
  END LOOP;
END $$;

-- ── 留言時間不得早於文章 ──
UPDATE news_comments c
SET created_at = n.created_at + (random() * LEAST(now() - n.created_at, INTERVAL '36 hours'))
FROM news n
WHERE n.id = c.news_id AND c.created_at < n.created_at;

SELECT '日榜筆數' AS 項目, count(*)::text AS 值 FROM leaderboard_bot_daily_stats WHERE date = CURRENT_DATE
UNION ALL
SELECT '留言早於文章', count(*)::text FROM news_comments c JOIN news n ON n.id=c.news_id WHERE c.created_at < n.created_at;
