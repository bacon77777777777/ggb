-- Migration 335: 一發入魂改為「對某商品的第一抽就中最高獎」
-- 原定義為帳號史上第一筆 draw_record，改成對該商品的第一筆

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
  IF NEW.is_last_one = TRUE THEN
    RETURN NEW;
  END IF;

  SELECT type INTO v_product_type FROM products WHERE id = NEW.product_id;
  IF v_product_type IS NULL OR v_product_type NOT IN ('ichiban', 'card', 'custom') THEN
    RETURN NEW;
  END IF;

  IF NEW.product_prize_id IS NOT NULL THEN
    SELECT total INTO v_prize_total FROM product_prizes WHERE id = NEW.product_prize_id;
    v_is_top := COALESCE(v_prize_total, 9999) <= 3;
  ELSE
    v_is_top := FALSE;
  END IF;

  -- 此商品的第一抽（含剛插入這筆）
  SELECT COUNT(*) INTO v_draw_count FROM draw_records
  WHERE user_id = NEW.user_id AND product_id = NEW.product_id;

  PERFORM public.update_top_prize_stats(
    NEW.user_id,
    v_is_top,
    v_draw_count = 1
  );

  RETURN NEW;
END;
$$;

-- 更新任務描述
UPDATE public.tasks SET description = '對任一商品首次抽獎即抽中最高獎'
  WHERE condition_type = 'top_prize_first';
