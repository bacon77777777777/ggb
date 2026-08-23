-- 604: 推薦 feed 冷啟動優化（老闆 2026-08-22）
--
-- 1. products.feed_boost：後台「推薦加權」0~3（×1／×1.5／×2／×3）。試營運由老闆決定要推什麼，
--    資料長出來後被學習權重（Thompson）自然稀釋。is_hot 維持貼紙，feed 只在 feed_boost=0 時
--    把 is_hot 當 ×1.5。
-- 2. get_popular_series：拿掉「真人抽獎 ≥20 筆」門檻，改成跟個人偏好同一套公式
--    （瀏覽 2／點擊 1.5／點系列 1／抽獎 3，7 天 ×1、30 天 ×0.5、更早 ×0.2，排除機器人）；
--    完全沒行為資料才退回「商品數 + is_hot×3 + feed_boost」。
-- 3. get_feed_topics：PROD 的商品標籤系統是空的（tags／product_tag_links 0 筆），話題改以
--    情報文章（tags + detect_series_from_name(title)，扣掉泛用詞）與站內搜尋紀錄為主；
--    標籤熱度那段留著，資料進來自動併入。
-- 4. get_feed_weights：多回 series／type／真人抽數／上架天數，前台做階層式先驗（新商品繼承
--    同系列／同類型的點擊率）與歷史轉換暖身。
-- 5. feed_bucket_report／feed_top_products：後台「推薦 feed 報表」用。

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS feed_boost smallint NOT NULL DEFAULT 0;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_feed_boost_range') THEN
    ALTER TABLE public.products ADD CONSTRAINT products_feed_boost_range CHECK (feed_boost BETWEEN 0 AND 3);
  END IF;
END $$;

-- 2. 全站系列熱門：行為 + 抽獎，不設門檻
CREATE OR REPLACE FUNCTION public.get_popular_series()
RETURNS TABLE(series text, score numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN QUERY
  WITH ev AS (
    SELECT ue.series,
           SUM(
             CASE ue.event_type WHEN 'product_view' THEN 2.0 WHEN 'product_click' THEN 1.5 WHEN 'series_click' THEN 1.0 ELSE 0 END
             * CASE WHEN ue.created_at > NOW() - INTERVAL '7 days' THEN 1.0
                    WHEN ue.created_at > NOW() - INTERVAL '30 days' THEN 0.5 ELSE 0.2 END
           )::numeric AS s
    FROM user_events ue
    LEFT JOIN users u ON u.id = ue.user_id
    WHERE ue.series IS NOT NULL AND ue.series <> ''
      AND ue.created_at > NOW() - INTERVAL '90 days'
      AND (u.is_bot IS NULL OR u.is_bot = false)
    GROUP BY ue.series
  ),
  dr AS (
    SELECT p.series,
           SUM(3.0 * CASE WHEN d.created_at > NOW() - INTERVAL '7 days' THEN 1.0
                          WHEN d.created_at > NOW() - INTERVAL '30 days' THEN 0.5 ELSE 0.2 END)::numeric AS s
    FROM draw_records d
    JOIN products p ON p.id = d.product_id
    JOIN users u ON u.id = d.user_id
    WHERE p.series IS NOT NULL AND p.series <> '' AND p.type <> 'slot'
      AND u.is_bot IS NOT TRUE
    GROUP BY p.series
  ),
  merged AS (
    SELECT COALESCE(ev.series, dr.series) AS series, COALESCE(ev.s, 0) + COALESCE(dr.s, 0) AS score
    FROM ev FULL OUTER JOIN dr ON ev.series = dr.series
  )
  SELECT m.series, m.score FROM merged m WHERE m.score > 0 ORDER BY m.score DESC LIMIT 20;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT p.series,
           SUM(CASE WHEN p.is_hot THEN 3 ELSE 1 END + p.feed_boost)::numeric AS score
    FROM products p
    WHERE p.series IS NOT NULL AND p.series <> '' AND p.status = 'active' AND p.type <> 'slot'
    GROUP BY p.series ORDER BY score DESC LIMIT 20;
  END IF;
END;
$$;

-- 3. 話題：情報文章 + 搜尋熱詞（+ 標籤熱度，未來）
CREATE OR REPLACE FUNCTION public.get_feed_topics(p_days integer DEFAULT 7)
RETURNS TABLE(keyword text, weight numeric, source text)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  WITH stop AS (
    SELECT unnest(ARRAY['萬代','公仔','轉蛋','扭蛋','食玩','景品','景品公仔','可動公仔','盒玩','一番賞','卡牌','周邊',
                        '模型','手辦','新品','預購','上市','開賣','限定','聯名','盲盒','玩具','動漫','角色','系列','發售']) AS w
  ),
  news_kw AS (
    SELECT kw AS keyword, SUM(5 + COALESCE(n.view_count, 0) / 20.0)::numeric AS weight
    FROM public.news n
    CROSS JOIN LATERAL (
      SELECT DISTINCT btrim(x) AS kw FROM (
        SELECT unnest(COALESCE(n.tags, ARRAY[]::text[])) AS x
        UNION ALL SELECT public.detect_series_from_name(n.title)
      ) t WHERE x IS NOT NULL AND length(btrim(x)) BETWEEN 2 AND 20
    ) k
    WHERE n.is_active = true AND n.created_at > now() - make_interval(days => p_days)
      AND kw NOT IN (SELECT w FROM stop)
    GROUP BY kw
  ),
  searches AS (
    SELECT btrim(s.keyword) AS keyword, (2 * COUNT(*))::numeric AS weight
    FROM public.search_logs s
    WHERE s.created_at > now() - make_interval(days => p_days)
      AND length(btrim(s.keyword)) BETWEEN 2 AND 20
    GROUP BY btrim(s.keyword) HAVING COUNT(*) >= 2
  ),
  tag_heat AS (
    SELECT t.name AS keyword, (COALESCE(SUM(st.views), 0) + 3 * COALESCE(SUM(st.draws), 0))::numeric AS weight
    FROM public.tag_daily_stats st JOIN public.tags t ON t.id = st.tag_id
    WHERE st.stat_date > current_date - p_days AND COALESCE(t.is_hidden, false) = false
    GROUP BY t.name HAVING COALESCE(SUM(st.views), 0) + 3 * COALESCE(SUM(st.draws), 0) > 0
  )
  SELECT keyword, SUM(weight) AS weight, string_agg(DISTINCT source, '+') AS source
  FROM (
    SELECT keyword, weight, 'news'::text AS source FROM news_kw
    UNION ALL SELECT keyword, weight, 'search' FROM searches
    UNION ALL SELECT keyword, weight, 'tag' FROM tag_heat
  ) x
  GROUP BY keyword ORDER BY SUM(weight) DESC LIMIT 40;
$$;

-- 4. 學習權重 + 階層式先驗／歷史暖身用的欄位
DROP FUNCTION IF EXISTS public.get_feed_weights(integer);
CREATE OR REPLACE FUNCTION public.get_feed_weights(p_days integer DEFAULT 14)
RETURNS TABLE(product_id bigint, impressions bigint, clicks bigint, series text, type text, draws bigint, days_listed integer)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  WITH ev AS (
    SELECT e.product_id,
           COUNT(*) FILTER (WHERE e.kind = 'impression') AS impressions,
           COUNT(*) FILTER (WHERE e.kind = 'click')      AS clicks
    FROM public.feed_events e
    LEFT JOIN public.users u ON u.id = e.user_id
    WHERE e.created_at > now() - make_interval(days => p_days)
      AND (u.is_bot IS NULL OR u.is_bot = false)
    GROUP BY e.product_id
  ),
  dr AS (
    SELECT d.product_id, COUNT(*) AS draws
    FROM public.draw_records d JOIN public.users u ON u.id = d.user_id
    WHERE u.is_bot IS NOT TRUE
    GROUP BY d.product_id
  )
  SELECT p.id, COALESCE(ev.impressions, 0), COALESCE(ev.clicks, 0), p.series, p.type::text, COALESCE(dr.draws, 0),
         GREATEST(1, (now()::date - COALESCE(p.started_at, p.created_at)::date))::integer
  FROM public.products p
  LEFT JOIN ev ON ev.product_id = p.id
  LEFT JOIN dr ON dr.product_id = p.id
  WHERE p.status <> 'pending' AND p.type <> 'slot';
$$;

-- 5. 報表
CREATE OR REPLACE FUNCTION public.feed_bucket_report(p_days integer DEFAULT 7)
RETURNS TABLE(bucket text, impressions bigint, clicks bigint, ctr numeric)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(e.bucket, '-') AS bucket,
         COUNT(*) FILTER (WHERE e.kind = 'impression') AS impressions,
         COUNT(*) FILTER (WHERE e.kind = 'click') AS clicks,
         ROUND(COUNT(*) FILTER (WHERE e.kind = 'click')::numeric / NULLIF(COUNT(*) FILTER (WHERE e.kind = 'impression'), 0), 4) AS ctr
  FROM public.feed_events e
  LEFT JOIN public.users u ON u.id = e.user_id
  WHERE e.created_at > now() - make_interval(days => p_days)
    AND (u.is_bot IS NULL OR u.is_bot = false)
  GROUP BY COALESCE(e.bucket, '-')
  ORDER BY impressions DESC;
$$;

CREATE OR REPLACE FUNCTION public.feed_top_products(p_days integer DEFAULT 7, p_limit integer DEFAULT 30)
RETURNS TABLE(product_id bigint, name text, series text, type text, feed_boost smallint, impressions bigint, clicks bigint, ctr numeric)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT p.id, p.name, p.series, p.type::text, p.feed_boost,
         COUNT(*) FILTER (WHERE e.kind = 'impression') AS impressions,
         COUNT(*) FILTER (WHERE e.kind = 'click') AS clicks,
         ROUND(COUNT(*) FILTER (WHERE e.kind = 'click')::numeric / NULLIF(COUNT(*) FILTER (WHERE e.kind = 'impression'), 0), 4) AS ctr
  FROM public.feed_events e
  JOIN public.products p ON p.id = e.product_id
  LEFT JOIN public.users u ON u.id = e.user_id
  WHERE e.created_at > now() - make_interval(days => p_days)
    AND (u.is_bot IS NULL OR u.is_bot = false)
  GROUP BY p.id, p.name, p.series, p.type, p.feed_boost
  ORDER BY impressions DESC
  LIMIT p_limit;
$$;

-- search_logs：STG 少 result_count（PROD 有），補齊讓 /api/search/log 兩環境都寫得進去
ALTER TABLE public.search_logs ADD COLUMN IF NOT EXISTS result_count integer;

-- products 對 anon／authenticated 是逐欄授權（公開欄位白名單），新欄位要補，不然前台 select 整個被拒
GRANT SELECT (feed_boost) ON public.products TO anon, authenticated;
