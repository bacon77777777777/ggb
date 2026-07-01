-- 198_dismantle_formula_only.sql
-- 分解值統一用公式計算，不讀 product_prizes.recycle_value
-- 公式：total 1-4 → floor(price/2)，其餘 → 50

BEGIN;

CREATE OR REPLACE FUNCTION public.dismantle_prizes(
  p_record_ids BIGINT[],
  p_user_id    UUID
) RETURNS TABLE (success_count INTEGER, total_refund INTEGER) AS $$
DECLARE
  v_record      RECORD;
  v_refund      INTEGER := 0;
  v_count       INTEGER := 0;
  v_prize_value INTEGER;
BEGIN
  FOR v_record IN
    SELECT dr.id,
           pp.total, pp.product_id, pp.name AS prize_name, pp.level AS prize_level,
           p.price
    FROM   public.draw_records   dr
    JOIN   public.product_prizes pp ON pp.id = dr.product_prize_id
    JOIN   public.products       p  ON p.id  = pp.product_id
    WHERE  dr.id      = ANY(p_record_ids)
      AND  dr.user_id = p_user_id
      AND  dr.status  = 'in_warehouse'
  LOOP
    IF v_record.total >= 1 AND v_record.total <= 4 THEN
      v_prize_value := FLOOR(v_record.price / 2);
    ELSE
      v_prize_value := 50;
    END IF;

    IF v_prize_value > 0 THEN
      UPDATE public.draw_records SET status = 'dismantled' WHERE id = v_record.id;

      INSERT INTO public.admin_recycle_pool (draw_record_id, user_id, product_id, prize_name, prize_level, recycle_value)
      VALUES (v_record.id, p_user_id, v_record.product_id, v_record.prize_name, v_record.prize_level, v_prize_value)
      ON CONFLICT DO NOTHING;

      v_refund := v_refund + v_prize_value;
      v_count  := v_count  + 1;
    END IF;
  END LOOP;

  IF v_refund > 0 THEN
    UPDATE public.users
    SET tokens = COALESCE(tokens, 0) + v_refund
    WHERE id = p_user_id;
  END IF;

  RETURN QUERY SELECT v_count, v_refund;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.dismantle_prizes(BIGINT[], UUID) TO authenticated;

COMMIT;
