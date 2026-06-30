-- 196_fix_delivery_and_dismantle.sql
-- 修復 create_delivery_order（移除不存在的 is_preorder 欄位參照）
-- 重新建立 dismantle_prizes 確保生產環境版本正確

BEGIN;

-- ── 1. create_delivery_order ──────────────────────────────────────────────────
DROP FUNCTION IF EXISTS create_delivery_order(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT[], INTEGER);

CREATE OR REPLACE FUNCTION public.create_delivery_order(
  p_user_id             UUID,
  p_recipient_name      TEXT,
  p_recipient_phone     TEXT,
  p_address             TEXT,
  p_logistics_type      TEXT,
  p_logistics_subtype   TEXT,
  p_store_id            TEXT,
  p_store_name          TEXT,
  p_draw_record_ids     BIGINT[],
  p_delivery_fee_points INTEGER
) RETURNS JSONB AS $$
DECLARE
  v_order_id     BIGINT;
  v_order_number VARCHAR(50);
  v_new_balance  INTEGER;
BEGIN
  -- 扣除運費點數（目前為 0）
  UPDATE public.users
  SET points = COALESCE(points, 0) - COALESCE(p_delivery_fee_points, 0)
  WHERE id = p_user_id
  RETURNING points INTO v_new_balance;

  v_order_number := 'OD' || to_char(now(), 'YYMMDD') || lpad(floor(random() * 10000)::text, 4, '0');

  INSERT INTO public.orders (
    order_number, user_id, recipient_name, recipient_phone, address,
    status, logistics_type, logistics_subtype, store_id, store_name
  ) VALUES (
    v_order_number, p_user_id, p_recipient_name, p_recipient_phone, p_address,
    'submitted', p_logistics_type, p_logistics_subtype, p_store_id, p_store_name
  ) RETURNING id INTO v_order_id;

  UPDATE public.draw_records
  SET status = 'pending_delivery',
      order_id = v_order_id
  WHERE id = ANY(p_draw_record_ids)
    AND user_id = p_user_id;

  INSERT INTO public.notifications (
    user_id, type, title, body, link, meta
  ) VALUES (
    p_user_id,
    'order_status',
    '配送申請已提交',
    format('您的配送申請已提交，訂單編號：%s', v_order_number),
    '/profile?tab=delivery',
    jsonb_build_object(
      'order_id', v_order_id,
      'order_number', v_order_number,
      'status', 'submitted'
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'new_balance', v_new_balance
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.create_delivery_order(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT[], INTEGER) TO authenticated;

-- ── 2. dismantle_prizes ───────────────────────────────────────────────────────
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
    SELECT dr.id, dr.product_prize_id,
           pp.recycle_value, pp.total, p.price
    FROM   public.draw_records     dr
    JOIN   public.product_prizes   pp ON pp.id = dr.product_prize_id
    JOIN   public.products         p  ON p.id  = pp.product_id
    WHERE  dr.id        = ANY(p_record_ids)
      AND  dr.user_id   = p_user_id
      AND  dr.status    = 'in_warehouse'
  LOOP
    v_prize_value := COALESCE(v_record.recycle_value, 0);

    -- fallback：recycle_value 未設定時依稀有度估算
    IF v_prize_value = 0 THEN
      IF v_record.total > 0 AND v_record.total <= 4 THEN
        v_prize_value := FLOOR(v_record.price / 2);
      ELSE
        v_prize_value := 50;
      END IF;
    END IF;

    IF v_prize_value > 0 THEN
      UPDATE public.draw_records SET status = 'dismantled' WHERE id = v_record.id;

      INSERT INTO public.admin_recycle_pool (product_prize_id, original_draw_record_id)
      VALUES (v_record.product_prize_id, v_record.id)
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
