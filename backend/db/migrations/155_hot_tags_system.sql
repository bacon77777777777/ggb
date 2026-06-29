BEGIN;

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pinned_order INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS public.product_view_events (
  event_date DATE NOT NULL DEFAULT CURRENT_DATE,
  user_id UUID NOT NULL,
  product_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_date, user_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.category_daily_stats (
  stat_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  views INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (stat_date, category_id)
);

CREATE OR REPLACE FUNCTION public.track_product_view(p_product_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_rows INT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Not authenticated');
  END IF;

  INSERT INTO public.product_view_events (event_date, user_id, product_id)
  VALUES (CURRENT_DATE, v_user_id, p_product_id)
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN jsonb_build_object('success', true, 'deduped', true);
  END IF;

  INSERT INTO public.category_daily_stats (stat_date, category_id, views, draws)
  SELECT
    CURRENT_DATE,
    category_id,
    1,
    0
  FROM (
    SELECT DISTINCT pt.category_id
    FROM public.product_tags pt
    WHERE pt.product_id = p_product_id
    UNION
    SELECT p.category_id
    FROM public.products p
    WHERE p.id = p_product_id AND p.category_id IS NOT NULL
  ) t
  ON CONFLICT (stat_date, category_id)
  DO UPDATE SET
    views = public.category_daily_stats.views + 1,
    updated_at = NOW();

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.track_product_view(BIGINT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.increment_draw_category_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.category_daily_stats (stat_date, category_id, views, draws)
  SELECT
    CURRENT_DATE,
    category_id,
    0,
    1
  FROM (
    SELECT DISTINCT pt.category_id
    FROM public.product_tags pt
    WHERE pt.product_id = NEW.product_id
    UNION
    SELECT p.category_id
    FROM public.products p
    WHERE p.id = NEW.product_id AND p.category_id IS NOT NULL
  ) t
  ON CONFLICT (stat_date, category_id)
  DO UPDATE SET
    draws = public.category_daily_stats.draws + 1,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_draw_records_category_stats ON public.draw_records;
CREATE TRIGGER trg_draw_records_category_stats
AFTER INSERT ON public.draw_records
FOR EACH ROW
EXECUTE FUNCTION public.increment_draw_category_stats();

CREATE OR REPLACE FUNCTION public.get_hot_categories(p_limit INTEGER DEFAULT 8, p_days INTEGER DEFAULT 30)
RETURNS TABLE (
  id UUID,
  name TEXT,
  score NUMERIC,
  is_pinned BOOLEAN,
  pinned_order INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH params AS (
    SELECT
      LEAST(GREATEST(p_limit, 1), 20) AS lim,
      LEAST(GREATEST(p_days, 1), 90) AS days
  ),
  pinned AS (
    SELECT
      c.id,
      c.name,
      1000000000::numeric AS score,
      TRUE AS is_pinned,
      COALESCE(c.pinned_order, 0) AS pinned_order
    FROM categories c
    WHERE c.is_active = TRUE
      AND COALESCE(c.is_hidden, FALSE) = FALSE
      AND COALESCE(c.is_pinned, FALSE) = TRUE
  ),
  stats AS (
    SELECT
      s.category_id,
      SUM(
        (s.views * 1 + s.draws * 8)
        * EXP(LN(0.9) * (CURRENT_DATE - s.stat_date))
      )::numeric AS score
    FROM category_daily_stats s, params p
    WHERE s.stat_date >= CURRENT_DATE - p.days
    GROUP BY s.category_id
  ),
  computed AS (
    SELECT
      c.id,
      c.name,
      COALESCE(st.score, 0)::numeric AS score,
      FALSE AS is_pinned,
      0 AS pinned_order
    FROM categories c
    LEFT JOIN stats st ON st.category_id = c.id
    WHERE c.is_active = TRUE
      AND COALESCE(c.is_hidden, FALSE) = FALSE
      AND COALESCE(c.is_pinned, FALSE) = FALSE
  ),
  combined AS (
    SELECT * FROM pinned
    UNION ALL
    SELECT * FROM computed
  )
  SELECT
    id,
    name,
    score,
    is_pinned,
    pinned_order
  FROM combined, params
  ORDER BY is_pinned DESC, pinned_order DESC, score DESC
  LIMIT (SELECT lim FROM params);
$$;

GRANT EXECUTE ON FUNCTION public.get_hot_categories(INTEGER, INTEGER) TO anon, authenticated;

CREATE OR REPLACE FUNCTION track_mission_event(p_event_type TEXT, p_data JSONB DEFAULT '{}'::jsonb)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_task RECORD;
  v_period_key TEXT;
  v_current_progress INT;
  v_meta JSONB;
  v_item_id TEXT;
  v_product_id BIGINT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Not authenticated');
  END IF;

  FOR v_task IN SELECT * FROM tasks WHERE condition_type = p_event_type AND is_active = true LOOP
    IF v_task.type = 'daily' THEN
      v_period_key := to_char(NOW(), 'YYYY-MM-DD');
    ELSIF v_task.type = 'weekly' THEN
      v_period_key := to_char(NOW(), 'IYYY-IW');
    ELSE
      v_period_key := 'ALL';
    END IF;

    IF p_event_type = 'view_product' THEN
      v_item_id := p_data->>'product_id';

      BEGIN
        v_product_id := v_item_id::bigint;
        PERFORM public.track_product_view(v_product_id);
      EXCEPTION WHEN OTHERS THEN
        v_product_id := NULL;
      END;

      SELECT progress, metadata INTO v_current_progress, v_meta
      FROM user_task_progress
      WHERE user_id = v_user_id AND task_id = v_task.id AND period_key = v_period_key;

      IF NOT FOUND THEN
        v_current_progress := 0;
        v_meta := '{"viewed_ids": []}'::jsonb;
      ELSIF v_meta IS NULL THEN
        v_meta := '{"viewed_ids": []}'::jsonb;
      END IF;

      IF v_meta->'viewed_ids' ? v_item_id THEN
        CONTINUE;
      END IF;

      IF NOT (v_meta ? 'viewed_ids') THEN
         v_meta := jsonb_set(v_meta, '{viewed_ids}', '[]'::jsonb);
      END IF;

      v_meta := jsonb_set(v_meta, '{viewed_ids}', (v_meta->'viewed_ids') || to_jsonb(v_item_id));

      INSERT INTO user_task_progress (user_id, task_id, progress, period_key, metadata)
      VALUES (v_user_id, v_task.id, 1, v_period_key, v_meta)
      ON CONFLICT (user_id, task_id, period_key)
      DO UPDATE SET
        progress = user_task_progress.progress + 1,
        metadata = EXCLUDED.metadata,
        last_updated = NOW();
    ELSE
      INSERT INTO user_task_progress (user_id, task_id, progress, period_key)
      VALUES (v_user_id, v_task.id, 1, v_period_key)
      ON CONFLICT (user_id, task_id, period_key)
      DO UPDATE SET
        progress = user_task_progress.progress + 1,
        last_updated = NOW();
    END IF;

    UPDATE user_task_progress
    SET is_completed = true
    WHERE user_id = v_user_id
      AND task_id = v_task.id
      AND period_key = v_period_key
      AND progress >= v_task.target_value
      AND is_completed = false;
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
