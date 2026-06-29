BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE public.categories
  DROP COLUMN IF EXISTS is_pinned,
  DROP COLUMN IF EXISTS pinned_order,
  DROP COLUMN IF EXISTS is_hidden;

DROP TRIGGER IF EXISTS trg_draw_records_category_stats ON public.draw_records;
DROP FUNCTION IF EXISTS public.increment_draw_category_stats();
DROP FUNCTION IF EXISTS public.get_hot_categories(INTEGER, INTEGER);
DROP TABLE IF EXISTS public.category_daily_stats;

CREATE TABLE IF NOT EXISTS public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  pinned_order INTEGER NOT NULL DEFAULT 0,
  is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_tags_name_ci ON public.tags ((lower(name)));

CREATE TABLE IF NOT EXISTS public.product_tag_links (
  product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, tag_id)
);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_tag_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all access for all users" ON public.tags;
CREATE POLICY "Enable all access for all users"
ON public.tags
FOR ALL
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all access for all users" ON public.product_tag_links;
CREATE POLICY "Enable all access for all users"
ON public.product_tag_links
FOR ALL
USING (true)
WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.menu_products (
  menu_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (menu_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_menu_products_menu ON public.menu_products(menu_id, sort_order DESC, created_at DESC);

ALTER TABLE public.menu_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access for all users" ON public.menu_products;
CREATE POLICY "Enable all access for all users"
ON public.menu_products
FOR ALL
USING (true)
WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.tag_daily_stats (
  stat_date DATE NOT NULL DEFAULT CURRENT_DATE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  views INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (stat_date, tag_id)
);

CREATE TABLE IF NOT EXISTS public.product_view_events (
  event_date DATE NOT NULL DEFAULT CURRENT_DATE,
  user_id UUID NOT NULL,
  product_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_date, user_id, product_id)
);

CREATE OR REPLACE FUNCTION public.track_hot_tags_product_view(p_product_id BIGINT)
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

  INSERT INTO public.tag_daily_stats (stat_date, tag_id, views, draws)
  SELECT
    CURRENT_DATE,
    ptl.tag_id,
    1,
    0
  FROM (
    SELECT DISTINCT tag_id
    FROM public.product_tag_links
    WHERE product_id = p_product_id
  ) ptl
  ON CONFLICT (stat_date, tag_id)
  DO UPDATE SET
    views = public.tag_daily_stats.views + 1,
    updated_at = NOW();

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.track_hot_tags_product_view(BIGINT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.increment_draw_tag_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.tag_daily_stats (stat_date, tag_id, views, draws)
  SELECT
    CURRENT_DATE,
    ptl.tag_id,
    0,
    1
  FROM (
    SELECT DISTINCT tag_id
    FROM public.product_tag_links
    WHERE product_id = NEW.product_id
  ) ptl
  ON CONFLICT (stat_date, tag_id)
  DO UPDATE SET
    draws = public.tag_daily_stats.draws + 1,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_draw_records_tag_stats ON public.draw_records;
CREATE TRIGGER trg_draw_records_tag_stats
AFTER INSERT ON public.draw_records
FOR EACH ROW
EXECUTE FUNCTION public.increment_draw_tag_stats();

CREATE OR REPLACE FUNCTION public.get_hot_tags(p_limit INTEGER DEFAULT 50, p_days INTEGER DEFAULT 30)
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
      LEAST(GREATEST(p_limit, 1), 200) AS lim,
      LEAST(GREATEST(p_days, 1), 180) AS days
  ),
  pinned AS (
    SELECT
      t.id,
      t.name,
      1000000000::numeric AS score,
      TRUE AS is_pinned,
      t.pinned_order AS pinned_order
    FROM tags t
    WHERE COALESCE(t.is_hidden, FALSE) = FALSE
      AND COALESCE(t.is_pinned, FALSE) = TRUE
  ),
  stats AS (
    SELECT
      s.tag_id,
      SUM(
        (s.views * 1 + s.draws * 8)
        * EXP(LN(0.9) * (CURRENT_DATE - s.stat_date))
      )::numeric AS score
    FROM tag_daily_stats s, params p
    WHERE s.stat_date >= CURRENT_DATE - p.days
    GROUP BY s.tag_id
  ),
  computed AS (
    SELECT
      t.id,
      t.name,
      COALESCE(st.score, 0)::numeric AS score,
      FALSE AS is_pinned,
      0 AS pinned_order
    FROM tags t
    LEFT JOIN stats st ON st.tag_id = t.id
    WHERE COALESCE(t.is_hidden, FALSE) = FALSE
      AND COALESCE(t.is_pinned, FALSE) = FALSE
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

GRANT EXECUTE ON FUNCTION public.get_hot_tags(INTEGER, INTEGER) TO anon, authenticated;

CREATE OR REPLACE FUNCTION track_mission_event(p_event_type TEXT, p_data JSONB DEFAULT '{}'::jsonb)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_task RECORD;
  v_period_key TEXT;
  v_current_progress INT;
  v_meta JSONB;
  v_item_id TEXT;
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

