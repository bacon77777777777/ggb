-- 228_prize_decompose_settings.sql
-- 賞項分解設定：auto / percent / fixed
-- auto: 依初始庫存智能判斷（≤3 → 抽價20%，≥4 → 10代幣）
-- percent: 管理員手動設定百分比
-- fixed: 管理員手動設定固定代幣數

BEGIN;

ALTER TABLE public.product_prizes
  ADD COLUMN IF NOT EXISTS decompose_type  TEXT NOT NULL DEFAULT 'auto'
    CHECK (decompose_type IN ('auto', 'percent', 'fixed')),
  ADD COLUMN IF NOT EXISTS decompose_value INTEGER;

-- 更新 dismantle_prizes function
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
    SELECT
      dr.id,
      pp.total,
      pp.decompose_type,
      pp.decompose_value,
      p.price,
      p.type AS product_type
    FROM   public.draw_records   dr
    JOIN   public.product_prizes pp ON pp.id = dr.product_prize_id
    JOIN   public.products       p  ON p.id  = pp.product_id
    WHERE  dr.id      = ANY(p_record_ids)
      AND  dr.user_id = p_user_id
      AND  dr.status  = 'in_warehouse'
  LOOP
    -- 轉蛋、盒玩：固定 10 代幣
    IF v_record.product_type IN ('gacha', 'blindbox') THEN
      v_prize_value := 10;

    -- 手動設定 %
    ELSIF v_record.decompose_type = 'percent' AND v_record.decompose_value IS NOT NULL THEN
      v_prize_value := GREATEST(1, FLOOR(v_record.price * v_record.decompose_value / 100));

    -- 手動設定固定代幣
    ELSIF v_record.decompose_type = 'fixed' AND v_record.decompose_value IS NOT NULL THEN
      v_prize_value := v_record.decompose_value;

    -- auto：依初始庫存判斷
    ELSE
      IF v_record.total <= 3 THEN
        v_prize_value := GREATEST(1, FLOOR(v_record.price * 0.2));
      ELSE
        v_prize_value := 10;
      END IF;
    END IF;

    UPDATE public.draw_records SET status = 'dismantled' WHERE id = v_record.id;

    INSERT INTO public.admin_recycle_pool (
      draw_record_id, user_id, product_id, prize_name, prize_level, recycle_value
    )
    SELECT v_record.id, p_user_id, pp.product_id, pp.name, pp.level, v_prize_value
    FROM   public.product_prizes pp
    WHERE  pp.id = (SELECT product_prize_id FROM public.draw_records WHERE id = v_record.id)
    ON CONFLICT DO NOTHING;

    v_refund := v_refund + v_prize_value;
    v_count  := v_count  + 1;
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
