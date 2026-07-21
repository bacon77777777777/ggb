-- Migration 333: 最高獎成就追蹤（trigger 方式）
-- 適用商品類型：ichiban / card / custom（轉蛋無賞等，排除）
-- 最高獎定義：product_prizes.total <= 3

-- 1. 確保 bad_luck_streak 欄位存在
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS bad_luck_streak INTEGER DEFAULT 0;

-- 2. Helper: 更新統計欄位 + user_task_progress
CREATE OR REPLACE FUNCTION public.update_top_prize_stats(
  p_user_id        UUID,
  p_is_top_prize   BOOLEAN,
  p_is_first_draw  BOOLEAN DEFAULT FALSE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_top_count    INTEGER;
  v_bad_streak   INTEGER;
  v_day_top      INTEGER;
  v_task         RECORD;
  v_period_key   TEXT;
BEGIN
  IF p_is_top_prize THEN
    -- 累積最高獎次數 +1，bad_luck_streak 歸零
    UPDATE public.users
    SET top_prize_count = COALESCE(top_prize_count, 0) + 1,
        bad_luck_streak = 0
    WHERE id = p_user_id
    RETURNING top_prize_count INTO v_top_count;

    -- 今日最高獎次數（重新計算，確保準確）
    SELECT COUNT(*) INTO v_day_top
    FROM public.draw_records dr
    JOIN public.product_prizes pp ON dr.product_prize_id = pp.id
    JOIN public.products pr ON dr.product_id = pr.id
    WHERE dr.user_id = p_user_id
      AND pr.type IN ('ichiban', 'card', 'custom')
      AND pp.total <= 3
      AND dr.is_last_one IS NOT TRUE
      AND dr.created_at >= (date_trunc('day', NOW() AT TIME ZONE 'Asia/Taipei') AT TIME ZONE 'Asia/Taipei');

    -- top_prize_count 任務（累積）
    FOR v_task IN SELECT * FROM public.tasks WHERE condition_type = 'top_prize_count' AND is_active = true LOOP
      INSERT INTO public.user_task_progress (user_id, task_id, progress, period_key)
      VALUES (p_user_id, v_task.id, v_top_count, 'ALL')
      ON CONFLICT (user_id, task_id, period_key)
      DO UPDATE SET progress = GREATEST(user_task_progress.progress, v_top_count), last_updated = NOW();

      UPDATE public.user_task_progress SET is_completed = true
      WHERE user_id = p_user_id AND task_id = v_task.id AND period_key = 'ALL'
        AND progress >= v_task.target_value AND is_completed = false;
    END LOOP;

    -- top_prize_day3 任務（單日）
    v_period_key := to_char(NOW() AT TIME ZONE 'Asia/Taipei', 'YYYY-MM-DD');
    FOR v_task IN SELECT * FROM public.tasks WHERE condition_type = 'top_prize_day3' AND is_active = true LOOP
      INSERT INTO public.user_task_progress (user_id, task_id, progress, period_key)
      VALUES (p_user_id, v_task.id, v_day_top, v_period_key)
      ON CONFLICT (user_id, task_id, period_key)
      DO UPDATE SET progress = GREATEST(user_task_progress.progress, v_day_top), last_updated = NOW();

      UPDATE public.user_task_progress SET is_completed = true
      WHERE user_id = p_user_id AND task_id = v_task.id AND period_key = v_period_key
        AND progress >= v_task.target_value AND is_completed = false;
    END LOOP;

    -- top_prize_first 任務（首抽即最高獎）
    IF p_is_first_draw AND v_top_count = 1 THEN
      FOR v_task IN SELECT * FROM public.tasks WHERE condition_type = 'top_prize_first' AND is_active = true LOOP
        INSERT INTO public.user_task_progress (user_id, task_id, progress, period_key)
        VALUES (p_user_id, v_task.id, 1, 'ALL')
        ON CONFLICT (user_id, task_id, period_key)
        DO UPDATE SET progress = GREATEST(user_task_progress.progress, 1), last_updated = NOW();

        UPDATE public.user_task_progress SET is_completed = true
        WHERE user_id = p_user_id AND task_id = v_task.id AND period_key = 'ALL'
          AND progress >= v_task.target_value AND is_completed = false;
      END LOOP;
    END IF;

  ELSE
    -- 非最高獎：連敗 streak +1
    UPDATE public.users
    SET bad_luck_streak = COALESCE(bad_luck_streak, 0) + 1
    WHERE id = p_user_id
    RETURNING bad_luck_streak INTO v_bad_streak;

    FOR v_task IN SELECT * FROM public.tasks WHERE condition_type = 'bad_luck_streak' AND is_active = true LOOP
      INSERT INTO public.user_task_progress (user_id, task_id, progress, period_key)
      VALUES (p_user_id, v_task.id, v_bad_streak, 'ALL')
      ON CONFLICT (user_id, task_id, period_key)
      DO UPDATE SET progress = GREATEST(user_task_progress.progress, v_bad_streak), last_updated = NOW();

      UPDATE public.user_task_progress SET is_completed = true
      WHERE user_id = p_user_id AND task_id = v_task.id AND period_key = 'ALL'
        AND progress >= v_task.target_value AND is_completed = false;
    END LOOP;
  END IF;
END;
$$;

-- 3. Trigger function（每筆 draw_record INSERT 後執行）
CREATE OR REPLACE FUNCTION public.trg_after_draw_top_prize()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_type TEXT;
  v_prize_total  INTEGER;
  v_is_top       BOOLEAN;
  v_draw_count   BIGINT;
BEGIN
  -- 最後賞不計算（屬於補發獎，不列入成就）
  IF NEW.is_last_one = TRUE THEN
    RETURN NEW;
  END IF;

  -- 只計算 ichiban / card / custom
  SELECT type INTO v_product_type FROM products WHERE id = NEW.product_id;
  IF v_product_type IS NULL OR v_product_type NOT IN ('ichiban', 'card', 'custom') THEN
    RETURN NEW;
  END IF;

  -- 判斷是否最高獎（total <= 3）
  IF NEW.product_prize_id IS NOT NULL THEN
    SELECT total INTO v_prize_total FROM product_prizes WHERE id = NEW.product_prize_id;
    v_is_top := COALESCE(v_prize_total, 9999) <= 3;
  ELSE
    v_is_top := FALSE;
  END IF;

  -- 判斷是否為對此商品的首抽（含剛插入這筆）
  SELECT COUNT(*) INTO v_draw_count FROM draw_records
  WHERE user_id = NEW.user_id AND product_id = NEW.product_id;

  PERFORM public.update_top_prize_stats(
    NEW.user_id,
    v_is_top,
    v_draw_count = 1   -- is_first_draw: 此商品的第一抽
  );

  RETURN NEW;
END;
$$;

-- 4. 掛上 trigger
DROP TRIGGER IF EXISTS trg_draw_record_top_prize ON public.draw_records;
CREATE TRIGGER trg_draw_record_top_prize
  AFTER INSERT ON public.draw_records
  FOR EACH ROW EXECUTE FUNCTION public.trg_after_draw_top_prize();

-- 5. 更新任務描述，明確說明適用範圍
UPDATE public.tasks SET description = '第一次抽獎即抽中最高獎（一番賞/抽卡/自製賞）'
  WHERE condition_type = 'top_prize_first';

UPDATE public.tasks SET description = '單日抽中最高獎 3 次（一番賞/抽卡/自製賞）'
  WHERE condition_type = 'top_prize_day3';

UPDATE public.tasks SET description = '累積抽中最高獎 10 次（一番賞/抽卡/自製賞）'
  WHERE condition_type = 'top_prize_count' AND target_value = 10;

UPDATE public.tasks SET description = '累積抽中最高獎 50 次（一番賞/抽卡/自製賞）'
  WHERE condition_type = 'top_prize_count' AND target_value = 50;

UPDATE public.tasks SET description = '連續 10 抽未中最高獎（一番賞/抽卡/自製賞）'
  WHERE condition_type = 'bad_luck_streak';
