-- 680: draw_records 補 dismantled_at（回收發生時間）
--
-- 老闆 2026-09-02 儀表板改版：新增「回收金額」指標（拆解退 G＝銷貨退回）。
-- 舊資料只有抽獎當下的 created_at，「今日回收多少」永遠對不上 ——
-- 補一根 dismantled_at，由唯一寫入點 dismantle_prizes 落 now()
-- （auto_dismantle_expired_warehouse_items 也是呼叫它）。
-- 歷史列為 NULL：報表端一律 COALESCE(dismantled_at, created_at)。

ALTER TABLE public.draw_records ADD COLUMN IF NOT EXISTS dismantled_at timestamptz;

CREATE OR REPLACE FUNCTION public.dismantle_prizes(p_record_ids bigint[], p_user_id uuid, p_trigger text DEFAULT 'manual'::text)
 RETURNS TABLE(success_count integer, total_refund integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_record      RECORD;
  v_refund      INTEGER := 0;
  v_count       INTEGER := 0;
  v_prize_value INTEGER;
  v_trigger     TEXT := CASE WHEN p_trigger = 'expired' THEN 'expired' ELSE 'manual' END;
BEGIN
  FOR v_record IN
    SELECT dr.id, dr.product_prize_id, pp.total, p.price, p.type AS product_type
    FROM   public.draw_records   dr
    JOIN   public.product_prizes pp ON pp.id = dr.product_prize_id
    JOIN   public.products       p  ON p.id  = pp.product_id
    WHERE  dr.id      = ANY(p_record_ids)
      AND  dr.user_id = p_user_id
      AND  dr.status  = 'in_warehouse'
      AND  p.sale_mode <> 'lottery'
  LOOP
    v_prize_value := public.calc_recycle_value(
      v_record.product_type, v_record.price, v_record.total
    );

    UPDATE public.draw_records
    SET status = 'dismantled', refund_amount = v_prize_value, dismantled_at = now()
    WHERE id = v_record.id;

    IF v_record.product_type IN ('gacha', 'blindbox') AND v_record.product_prize_id IS NOT NULL THEN
      UPDATE public.product_prizes
      SET remaining = COALESCE(remaining, 0) + 1
      WHERE id = v_record.product_prize_id;
    END IF;

    INSERT INTO public.admin_recycle_pool (
      draw_record_id, user_id, product_id, product_prize_id,
      prize_name, prize_level, recycle_value,
      unit_price, margin, trigger
    )
    SELECT v_record.id, p_user_id, pp.product_id, pp.id,
           pp.name, pp.level, v_prize_value,
           v_record.price::integer,
           GREATEST(0, v_record.price::integer - v_prize_value),
           v_trigger
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
$function$
;
