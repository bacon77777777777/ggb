-- 331_create_delivery_orders_split.sql
-- 從 PROD 補回 STG 缺少的配送拆單 RPC
-- 依 supplier_id 分組，每廠商獨立建訂單

CREATE OR REPLACE FUNCTION public.create_delivery_orders_split(
  p_recipient_name    text,
  p_recipient_phone   text,
  p_address           text,
  p_logistics_type    text,
  p_logistics_subtype text,
  p_store_id          text,
  p_store_name        text,
  p_draw_record_ids   bigint[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id     UUID := auth.uid();
  v_supplier    RECORD;
  v_order_id    BIGINT;
  v_order_number VARCHAR(50);
  v_orders_out  JSONB[] := '{}';
  v_block_count INT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '請先登入');
  END IF;

  -- 擋預購未到期商品
  SELECT COUNT(1) INTO v_block_count
  FROM draw_records dr
  JOIN products p ON p.id = dr.product_id
  WHERE dr.id = ANY(p_draw_record_ids)
    AND dr.user_id = v_user_id
    AND dr.status = 'in_warehouse'
    AND COALESCE(p.is_preorder, FALSE) = TRUE
    AND (p.preorder_available_at IS NULL OR now() < p.preorder_available_at);

  IF v_block_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'message', '包含尚未開放配送的預購商品');
  END IF;

  -- 依 supplier_id 分組建立各廠商訂單
  FOR v_supplier IN
    SELECT
      COALESCE(p.supplier_id, 0)        AS supplier_id,
      COALESCE(s.name, '未知廠商')::TEXT  AS supplier_name,
      ARRAY_AGG(dr.id)                  AS dr_ids
    FROM draw_records dr
    JOIN products p ON p.id = dr.product_id
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    WHERE dr.id = ANY(p_draw_record_ids)
      AND dr.user_id = v_user_id
      AND dr.status = 'in_warehouse'
    GROUP BY p.supplier_id, s.name
  LOOP
    -- 產生唯一訂單編號
    LOOP
      v_order_number := 'OD' || to_char(now(), 'YYMMDD') || lpad(floor(random() * 90000 + 10000)::text, 5, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM orders WHERE order_number = v_order_number);
    END LOOP;

    INSERT INTO orders (
      order_number, user_id, recipient_name, recipient_phone, address,
      status, logistics_type, logistics_subtype, store_id, store_name, supplier_id
    ) VALUES (
      v_order_number, v_user_id, p_recipient_name, p_recipient_phone, p_address,
      'submitted', p_logistics_type, p_logistics_subtype, p_store_id, p_store_name,
      NULLIF(v_supplier.supplier_id, 0)
    ) RETURNING id INTO v_order_id;

    UPDATE draw_records
    SET status = 'pending_delivery', order_id = v_order_id
    WHERE id = ANY(v_supplier.dr_ids) AND user_id = v_user_id;

    INSERT INTO notifications (user_id, type, title, body, link, meta)
    VALUES (
      v_user_id, 'order_status',
      format('[%s] 配送申請已提交', v_supplier.supplier_name),
      format('訂單編號：%s，共 %s 件', v_order_number, array_length(v_supplier.dr_ids, 1)),
      '/profile?tab=delivery',
      jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number, 'supplier_name', v_supplier.supplier_name)
    );

    v_orders_out := v_orders_out || jsonb_build_object(
      'order_id', v_order_id,
      'order_number', v_order_number,
      'supplier_name', v_supplier.supplier_name,
      'item_count', array_length(v_supplier.dr_ids, 1)
    );
  END LOOP;

  IF array_length(v_orders_out, 1) IS NULL OR array_length(v_orders_out, 1) = 0 THEN
    RETURN jsonb_build_object('success', false, 'message', '沒有可配送的商品');
  END IF;

  RETURN jsonb_build_object('success', true, 'orders', to_jsonb(v_orders_out));
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_delivery_orders_split TO authenticated;
