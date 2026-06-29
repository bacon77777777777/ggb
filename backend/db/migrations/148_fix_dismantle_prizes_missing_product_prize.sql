BEGIN;

CREATE OR REPLACE FUNCTION dismantle_prizes(
  p_record_ids BIGINT[],
  p_user_id UUID
) RETURNS TABLE (
  success_count INTEGER,
  total_refund INTEGER
) AS $$
DECLARE
  v_record RECORD;
  v_refund INTEGER := 0;
  v_count INTEGER := 0;
  v_prize_value INTEGER;
  v_prize_total INTEGER;
  v_product_price INTEGER;
  v_resolved_prize_id BIGINT;
BEGIN
  FOR v_record IN
    SELECT
      dr.id,
      dr.product_id,
      dr.product_prize_id,
      dr.prize_level,
      dr.prize_name,
      pp.id AS pp_id,
      pp.recycle_value AS pp_recycle_value,
      pp.total AS pp_total,
      pp.quantity AS pp_quantity,
      p.price AS product_price
    FROM draw_records dr
    LEFT JOIN product_prizes pp ON dr.product_prize_id = pp.id
    LEFT JOIN products p ON dr.product_id = p.id
    WHERE dr.id = ANY(p_record_ids)
      AND dr.user_id = p_user_id
      AND dr.status = 'in_warehouse'
  LOOP
    v_resolved_prize_id := v_record.pp_id;

    IF v_resolved_prize_id IS NULL AND v_record.product_id IS NOT NULL THEN
      SELECT pp2.id, pp2.recycle_value, pp2.total, pp2.quantity
      INTO v_resolved_prize_id, v_record.pp_recycle_value, v_record.pp_total, v_record.pp_quantity
      FROM product_prizes pp2
      WHERE pp2.product_id = v_record.product_id
        AND (
          (v_record.prize_level IS NOT NULL AND pp2.level = v_record.prize_level)
          OR (v_record.prize_name IS NOT NULL AND pp2.name = v_record.prize_name)
        )
      ORDER BY
        CASE WHEN v_record.prize_level IS NOT NULL AND pp2.level = v_record.prize_level THEN 0 ELSE 1 END,
        pp2.id
      LIMIT 1;
    END IF;

    v_prize_value := COALESCE(v_record.pp_recycle_value, 0);
    v_prize_total := COALESCE(v_record.pp_total, v_record.pp_quantity, 0);
    v_product_price := COALESCE(v_record.product_price, 0);

    IF v_prize_value = 0 THEN
      IF v_product_price > 0 THEN
        IF v_prize_total > 0 AND v_prize_total <= 4 THEN
          v_prize_value := FLOOR(v_product_price / 2);
        ELSE
          v_prize_value := 50;
        END IF;
      END IF;
    END IF;

    IF v_prize_value > 0 THEN
      UPDATE draw_records
      SET status = 'dismantled'
      WHERE id = v_record.id;

      IF v_resolved_prize_id IS NOT NULL THEN
        INSERT INTO admin_recycle_pool (product_prize_id, original_draw_record_id)
        VALUES (v_resolved_prize_id, v_record.id);
      END IF;

      v_refund := v_refund + v_prize_value;
      v_count := v_count + 1;
    END IF;
  END LOOP;

  IF v_refund > 0 THEN
    UPDATE users
    SET tokens = COALESCE(tokens, 0) + v_refund
    WHERE id = p_user_id;
  END IF;

  RETURN QUERY SELECT v_count, v_refund;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;

