-- Personalized series preference score
-- Combines draw records, product follows, and user events with recency decay

CREATE OR REPLACE FUNCTION public.get_user_series_preferences(
  p_user_id UUID DEFAULT NULL,
  p_limit   INT  DEFAULT 10
)
RETURNS TABLE (series TEXT, score NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH
  -- Event-based signals (views, clicks, searches)
  event_scores AS (
    SELECT
      ue.series,
      SUM(
        CASE ue.event_type
          WHEN 'product_view'  THEN 2.0
          WHEN 'product_click' THEN 1.5
          WHEN 'series_click'  THEN 1.0
          WHEN 'search'        THEN 0.5
          ELSE 0.5
        END
        *
        CASE
          WHEN ue.created_at > NOW() - INTERVAL '7 days'  THEN 1.0
          WHEN ue.created_at > NOW() - INTERVAL '30 days' THEN 0.5
          ELSE 0.2
        END
      ) AS pts
    FROM public.user_events ue
    WHERE ue.user_id = p_user_id
      AND ue.series IS NOT NULL AND ue.series <> ''
    GROUP BY ue.series
  ),
  -- Draw records — strongest signal
  draw_scores AS (
    SELECT
      p.series,
      SUM(
        5.0
        *
        CASE
          WHEN dr.created_at > NOW() - INTERVAL '7 days'  THEN 1.0
          WHEN dr.created_at > NOW() - INTERVAL '30 days' THEN 0.5
          ELSE 0.2
        END
      ) AS pts
    FROM public.draw_records dr
    JOIN public.products p ON p.id = dr.product_id
    WHERE dr.user_id = p_user_id
      AND p.series IS NOT NULL AND p.series <> ''
    GROUP BY p.series
  ),
  -- Product follows — strong interest signal
  follow_scores AS (
    SELECT
      p.series,
      COUNT(*) * 3.0 AS pts
    FROM public.product_follows pf
    JOIN public.products p ON p.id = pf.product_id
    WHERE pf.user_id = p_user_id
      AND p.series IS NOT NULL AND p.series <> ''
    GROUP BY p.series
  ),
  combined AS (
    SELECT series, pts FROM event_scores
    UNION ALL
    SELECT series, pts FROM draw_scores
    UNION ALL
    SELECT series, pts FROM follow_scores
  )
  SELECT c.series, SUM(c.pts) AS score
  FROM combined c
  GROUP BY c.series
  ORDER BY score DESC
  LIMIT p_limit;
END;
$$;
