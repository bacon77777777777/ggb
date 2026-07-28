-- 分解轉蛋/盒玩品項時，將庫存加回 product_prizes.remaining
-- 一番賞/抽卡/自製賞為序列商品，不可加回（會破壞驗證順序）
CREATE OR REPLACE FUNCTION public.dismantle_prizes(p_record_ids bigint[], p_user_id uuid)
 RETURNS TABLE(success_count integer, total_refund integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_record      RECORD;
  v_refund      INTEGER := 0;
  v_count       INTEGER := 0;
  v_prize_value INTEGER;
BEGIN
  FOR v_record IN
    SELECT
      dr.id,
      dr.product_prize_id,
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

    -- 轉蛋/盒玩：分解後庫存歸還（廠商仍持有實物，可再次出貨）
    -- 一番賞/抽卡/自製賞為序列商品不加回，避免破壞抽獎順序與種子驗證
    IF v_record.product_type IN ('gacha', 'blindbox') AND v_record.product_prize_id IS NOT NULL THEN
      UPDATE public.product_prizes
      SET remaining = COALESCE(remaining, 0) + 1
      WHERE id = v_record.product_prize_id;
    END IF;

    INSERT INTO public.admin_recycle_pool (
      draw_record_id, user_id, product_id, prize_name, prize_level, recycle_value
    )
    SELECT v_record.id, p_user_id, pp.product_id, pp.name, pp.level, v_prize_value
    FROM   public.product_prizes pp
    WHERE  pp.id = v_record.product_prize_id
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
$function$;
