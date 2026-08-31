-- 659_order_cancelled_items_snapshot.sql
--
-- 已取消的訂單展開後要看得到「當時申請了哪些品項」（老闆 2026-08-31）。
--
-- ## 為什麼原本看不到
--
-- 取消訂單＝把品項退回倉庫，做法是 `UPDATE draw_records SET order_id = NULL`
-- （見 cancel_delivery_order）。關聯一斷，後台那條 `items:draw_records(...)`
-- 就撈不到任何東西 —— 展開是一片空白，件數顯示 0。
-- 客服想查「他當時到底申請了什麼」完全查不到。
--
-- ## 做法
--
-- 解開關聯**之前**先拍一份快照存進 `orders.cancelled_items`（jsonb）。
-- 讀取端在 order_id 撈不到品項時改讀它。
--
-- 存 jsonb 而不是寫進 `order_items`：那張表目前是空的、沒有任何程式在用，
-- 拿來裝「只有取消單才有」的資料，會讓它的語意變成一半一半。
--
-- ⚠️ 只對**之後**的取消有效。已經取消掉的單關聯早就斷了，救不回來 ——
-- 那些單展開仍會是空的，前端顯示「品項紀錄已不可考」而不是一片空白。

BEGIN;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_items jsonb;
COMMENT ON COLUMN orders.cancelled_items IS
  '取消當下的品項快照。取消會把 draw_records.order_id 設為 NULL（品項退回倉庫），關聯斷掉後只剩這裡查得到';

CREATE OR REPLACE FUNCTION public.cancel_delivery_order(p_order_id bigint, p_kind text DEFAULT 'admin'::text, p_operator text DEFAULT 'system'::text, p_refund_shipping boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_snapshot jsonb;
  v_order          orders%ROWTYPE;
  v_refund_ship    BOOLEAN;
  v_ship_fee       INTEGER := 0;
  v_lottery        INTEGER := 0;
  v_total          INTEGER := 0;
  v_items          INTEGER := 0;
  v_already        BOOLEAN;
  v_refund_tag     TEXT;
BEGIN
  -- 鎖住這張單，避免後台按取消的同時綠界 callback 也打進來，退兩次款
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND');
  END IF;

  IF v_order.status = 'delivered' THEN
    RETURN jsonb_build_object('success', false, 'error', 'ALREADY_DELIVERED');
  END IF;

  v_refund_tag := format('取消退還（訂單 %s）', v_order.order_number);

  -- 冪等：綠界的 callback 會重送，重送不該再退一次
  SELECT EXISTS (
    SELECT 1 FROM token_adjustments
    WHERE user_id = v_order.user_id AND reason LIKE v_refund_tag || '%'
  ) INTO v_already;

  v_refund_ship := COALESCE(p_refund_shipping, p_kind <> 'returned');

  IF NOT v_already THEN
    IF v_refund_ship THEN
      v_ship_fee := COALESCE(v_order.shipping_fee, 0);
    END IF;

    -- 價金從原始扣款記錄回推，比重算準（品項狀態這時已經變了）
    SELECT COALESCE(-SUM(delta), 0)::INTEGER INTO v_lottery
    FROM token_adjustments
    WHERE user_id = v_order.user_id
      AND reason = format('抽籤販售價金（訂單 %s）', v_order.order_number)
      AND delta < 0;

    v_total := v_ship_fee + v_lottery;

    IF v_ship_fee > 0 THEN
      INSERT INTO token_adjustments (user_id, delta, reason, created_by, category)
      VALUES (v_order.user_id, v_ship_fee,
              v_refund_tag || '・運費', p_operator, 'shipping_fee');
    END IF;

    IF v_lottery > 0 THEN
      INSERT INTO token_adjustments (user_id, delta, reason, created_by, category)
      VALUES (v_order.user_id, v_lottery,
              v_refund_tag || '・抽籤價金', p_operator, 'correction');
    END IF;

    IF v_total > 0 THEN
      UPDATE users SET tokens = COALESCE(tokens, 0) + v_total WHERE id = v_order.user_id;
    END IF;
  END IF;

  /*
   * 品項退回倉庫。
   * 要連 'shipped' 一起收 —— 退貨的單在 callback 誤標之前就可能已經是 shipped，
   * 只認 pending_delivery 會漏掉真正需要救回來的那些。
   */
  /*
   * 先把「這張單當時有哪些品項」拍一份快照，再解開關聯（老闆 2026-08-31）。
   *
   * 取消＝把品項退回倉庫＝`draw_records.order_id` 設成 NULL，關聯一斷，
   * 後台展開已取消的訂單就是一片空白 —— 客服要查「他當時到底申請了什麼」
   * 完全查不到。快照存在 orders.cancelled_items，讀取端在 order_id 撈不到
   * 品項時改讀它。
   *
   * 存 jsonb 而不是寫進 order_items：那張表現在是空的、沒有任何程式在用，
   * 拿來裝「只有取消單才有」的資料會讓它的語意變成一半一半。
   */
  SELECT jsonb_agg(jsonb_build_object(
           'id', dr.id,
           'prize_name', COALESCE(pp.name, dr.prize_name),
           'prize_level', COALESCE(pp.level, dr.prize_level),
           'image_url', COALESCE(pp.image_url, p.image_url),
           'product_name', p.name,
           'product_type', p.type,
           'ticket_number', dr.ticket_number
         ) ORDER BY dr.id)
    INTO v_snapshot
    FROM draw_records dr
    LEFT JOIN product_prizes pp ON pp.id = dr.product_prize_id
    LEFT JOIN products p ON p.id = dr.product_id
   WHERE dr.order_id = p_order_id;

  UPDATE draw_records
     SET status = 'in_warehouse', order_id = NULL
   WHERE order_id = p_order_id
     AND status IN ('pending_delivery', 'shipped');
  GET DIAGNOSTICS v_items = ROW_COUNT;

  UPDATE orders
     SET status = 'cancelled', cancelled_items = v_snapshot, updated_at = now()
   WHERE id = p_order_id;

  -- 通知玩家。綠界回報退貨時原本什麼都不說，玩家只會看到訂單忽然變已取消
  INSERT INTO notifications (user_id, type, title, body, link, meta)
  VALUES (
    v_order.user_id, 'order_status',
    CASE WHEN p_kind = 'returned' THEN '包裹已退回' ELSE '配送訂單已取消' END,
    CASE
      WHEN p_kind = 'returned' THEN
        format('訂單 %s 的包裹已退回（逾期未取或地址有誤），%s 件商品已放回你的倉庫，可以重新申請配送。%s',
               v_order.order_number, v_items,
               CASE WHEN v_refund_ship THEN '運費已退回。' ELSE '運費已支付給物流，恕不退還。' END)
      ELSE
        format('訂單 %s 已取消，%s 件商品已放回你的倉庫%s',
               v_order.order_number, v_items,
               CASE WHEN v_total > 0 THEN format('，並退回 %s 代幣。', v_total) ELSE '。' END)
    END,
    '/profile?tab=delivery',
    jsonb_build_object(
      'order_id', p_order_id, 'order_number', v_order.order_number,
      'status', 'cancelled', 'kind', p_kind,
      'refunded', CASE WHEN v_already THEN 0 ELSE v_total END,
      'items_returned', v_items
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'order_number', v_order.order_number,
    'items_returned', v_items,
    'refunded', CASE WHEN v_already THEN 0 ELSE v_total END,
    'refunded_shipping', CASE WHEN v_already THEN 0 ELSE v_ship_fee END,
    'refunded_lottery', CASE WHEN v_already THEN 0 ELSE v_lottery END,
    'already_refunded', v_already
  );
END;
$function$;

COMMIT;
