-- 603: 首頁推薦 feed 的曝光／點擊事件 + 學習用統計（老闆 2026-08-22：階段二）
--
-- feed_events：每張卡「進入視口」記一筆 impression、點擊記一筆 click，帶桶別（forYou/topic/
-- hot/fresh/explore）、位置、A/B 變體。只由 /api/feed/events 以 service role 寫入；RLS 開、
-- 不給任何 policy（前台匿名讀不到、也寫不到）。
--
-- get_feed_weights：近 N 天每個商品的曝光／點擊（排除機器人）→ 前台用 Thompson sampling
-- 抽 Beta 分布當權重：點擊率高的自動多推、沒資料的靠先驗 + 變異數自然探索。
-- get_feed_topics：話題訊號 = 商品標籤的近期瀏覽／抽數（tag_daily_stats）+ 站內搜尋熱詞。
-- feed_ab_report：A/B 報表（變體 → 曝光／點擊／點擊率／30 分鐘內有抽獎的 session 數）。
-- platform_settings.feed_ab_ratio：分到舊排序（v1）的百分比，預設 0 = 全部用新 feed。

CREATE TABLE IF NOT EXISTS public.feed_events (
  id          bigserial PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  user_id     uuid,
  session_id  text NOT NULL,
  variant     text NOT NULL DEFAULT 'v2',
  kind        text NOT NULL CHECK (kind IN ('impression', 'click')),
  product_id  bigint NOT NULL,
  bucket      text,
  position    integer
);
CREATE INDEX IF NOT EXISTS feed_events_product_created_idx ON public.feed_events (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS feed_events_created_idx ON public.feed_events (created_at DESC);
CREATE INDEX IF NOT EXISTS feed_events_session_idx ON public.feed_events (session_id, created_at DESC);
ALTER TABLE public.feed_events ENABLE ROW LEVEL SECURITY;

INSERT INTO public.platform_settings (key, value) VALUES ('feed_ab_ratio', '0')
ON CONFLICT (key) DO NOTHING;

-- 近 p_days 天每個商品的曝光／點擊（排除機器人帳號）
CREATE OR REPLACE FUNCTION public.get_feed_weights(p_days integer DEFAULT 14)
RETURNS TABLE(product_id bigint, impressions bigint, clicks bigint)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT e.product_id,
         COUNT(*) FILTER (WHERE e.kind = 'impression') AS impressions,
         COUNT(*) FILTER (WHERE e.kind = 'click')      AS clicks
  FROM public.feed_events e
  LEFT JOIN public.users u ON u.id = e.user_id
  WHERE e.created_at > now() - make_interval(days => p_days)
    AND (u.is_bot IS NULL OR u.is_bot = false)
  GROUP BY e.product_id;
$$;

-- 話題：商品標籤近期熱度 + 站內搜尋熱詞
CREATE OR REPLACE FUNCTION public.get_feed_topics(p_days integer DEFAULT 7)
RETURNS TABLE(keyword text, weight numeric, source text)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  WITH tag_heat AS (
    SELECT t.name AS keyword,
           (COALESCE(SUM(s.views), 0) + 3 * COALESCE(SUM(s.draws), 0))::numeric AS weight,
           'tag'::text AS source
    FROM public.tag_daily_stats s
    JOIN public.tags t ON t.id = s.tag_id
    WHERE s.stat_date > current_date - p_days
      AND COALESCE(t.is_hidden, false) = false
    GROUP BY t.name
    HAVING COALESCE(SUM(s.views), 0) + 3 * COALESCE(SUM(s.draws), 0) > 0
  ),
  searches AS (
    SELECT btrim(keyword) AS keyword, (2 * COUNT(*))::numeric AS weight, 'search'::text AS source
    FROM public.search_logs
    WHERE created_at > now() - make_interval(days => p_days)
      AND length(btrim(keyword)) BETWEEN 2 AND 20
    GROUP BY btrim(keyword)
    HAVING COUNT(*) >= 2
  )
  SELECT * FROM (SELECT * FROM tag_heat UNION ALL SELECT * FROM searches) x
  ORDER BY weight DESC
  LIMIT 30;
$$;

-- A/B 報表：每個變體的 session 數、曝光、點擊、點擊率、點擊後 30 分鐘內有抽獎的 session 數
CREATE OR REPLACE FUNCTION public.feed_ab_report(p_days integer DEFAULT 7)
RETURNS TABLE(variant text, sessions bigint, impressions bigint, clicks bigint, ctr numeric, draw_sessions bigint)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  WITH ev AS (
    SELECT e.* FROM public.feed_events e
    LEFT JOIN public.users u ON u.id = e.user_id
    WHERE e.created_at > now() - make_interval(days => p_days)
      AND (u.is_bot IS NULL OR u.is_bot = false)
  ),
  clicks AS (SELECT * FROM ev WHERE kind = 'click'),
  draw_sess AS (
    SELECT DISTINCT c.variant, c.session_id
    FROM clicks c
    JOIN public.draw_records d
      ON d.user_id = c.user_id
     AND d.product_id = c.product_id
     AND d.created_at BETWEEN c.created_at AND c.created_at + interval '30 minutes'
    WHERE c.user_id IS NOT NULL
  )
  SELECT ev.variant,
         COUNT(DISTINCT ev.session_id) AS sessions,
         COUNT(*) FILTER (WHERE ev.kind = 'impression') AS impressions,
         COUNT(*) FILTER (WHERE ev.kind = 'click') AS clicks,
         ROUND(COUNT(*) FILTER (WHERE ev.kind = 'click')::numeric
               / NULLIF(COUNT(*) FILTER (WHERE ev.kind = 'impression'), 0), 4) AS ctr,
         (SELECT COUNT(*) FROM draw_sess ds WHERE ds.variant = ev.variant) AS draw_sessions
  FROM ev
  GROUP BY ev.variant
  ORDER BY ev.variant;
$$;

-- 保留 90 天（有 pg_cron 的環境才排程；STG 沒有，靠 PROD 的同一條）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'feed-events-prune';
    PERFORM cron.schedule('feed-events-prune', '30 20 * * *',
      $sql$DELETE FROM public.feed_events WHERE created_at < now() - interval '90 days'$sql$);
  END IF;
END $$;
