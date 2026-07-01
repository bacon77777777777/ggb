-- Add track_mission_event RPC used by frontend MissionService.trackEvent()
-- This function updates user_task_progress for matching tasks

CREATE OR REPLACE FUNCTION public.track_mission_event(
  p_event_type TEXT,
  p_data JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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

  FOR v_task IN
    SELECT * FROM public.tasks
    WHERE condition_type = p_event_type AND is_active = true
  LOOP
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
      FROM public.user_task_progress
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

      INSERT INTO public.user_task_progress (user_id, task_id, progress, period_key, metadata)
      VALUES (v_user_id, v_task.id, 1, v_period_key, v_meta)
      ON CONFLICT (user_id, task_id, period_key)
      DO UPDATE SET
        progress = public.user_task_progress.progress + 1,
        metadata = EXCLUDED.metadata,
        last_updated = NOW();
    ELSE
      INSERT INTO public.user_task_progress (user_id, task_id, progress, period_key)
      VALUES (v_user_id, v_task.id, 1, v_period_key)
      ON CONFLICT (user_id, task_id, period_key)
      DO UPDATE SET
        progress = public.user_task_progress.progress + 1,
        last_updated = NOW();
    END IF;

    UPDATE public.user_task_progress
    SET is_completed = true
    WHERE user_id = v_user_id
      AND task_id = v_task.id
      AND period_key = v_period_key
      AND progress >= v_task.target_value
      AND is_completed = false;
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.track_mission_event(TEXT, JSONB) TO authenticated;
