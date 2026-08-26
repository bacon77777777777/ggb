-- 631: 配送訂單取消／退貨的單一入口（老闆 2026-08-26：「這兩個要修」）
--
-- 修掉兩個真的會賠錢的洞：
--
-- ① 超商逾期退貨 → 玩家的貨憑空消失
--    `logistics/callback` 判斷式是 `statusPriority[status] >= statusPriority.picked_up`，
--    而 cancelled 的優先級是 6、picked_up 是 3 —— 6 >= 3 成立，於是綠界回報退貨
--    （3006/3018 超商逾期、3020/3022 宅配退件）時，訂單標成已取消，
--    **玩家的品項卻被標成「已出貨」**：不在倉庫、也沒收到，這批貨就消失了。
--
-- ② 取消訂單不退代幣
--    後台的取消只把品項退回倉庫，運費與抽籤價金一毛沒退。玩家白付 60–65，
--    而且對帳公式 `expected = recharge + manual − draw − refund` 會少掉這一筆。
--
-- 為什麼寫成 DB function 而不是各自在 API 修：取消有三個入口
-- （後台單筆、後台批量、綠界 callback），邏輯散在三處遲早再漂移一次。
--
-- 退款規則：
--   抽籤價金 —— **一律退**。貨退回倉庫＝東西還沒真的給玩家，這筆錢不該收。
--   運費 —— 看是誰造成的：
--     'admin'    平台或客服在寄出前取消 → 退（成本還沒發生）
--     'returned' 超商逾期未取／宅配退件 → 不退（運費已經付給物流了，
--                退給玩家等於平台自己吸收；逾期不取也該有嚇阻力）
--   p_refund_shipping 可覆寫，留給日後後台做「破例退運費」。

CREATE OR REPLACE FUNCTION public.cancel_delivery_order(
  p_order_id        BIGINT,
  p_kind            TEXT DEFAULT 'admin',      -- 'admin' | 'returned'
  p_operator        TEXT DEFAULT 'system',
  p_refund_shipping BOOLEAN DEFAULT NULL       -- NULL = 照 p_kind 判斷
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
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
  UPDATE draw_records
     SET status = 'in_warehouse', order_id = NULL
   WHERE order_id = p_order_id
     AND status IN ('pending_delivery', 'shipped');
  GET DIAGNOSTICS v_items = ROW_COUNT;

  UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = p_order_id;

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

COMMENT ON FUNCTION public.cancel_delivery_order(BIGINT, TEXT, TEXT, BOOLEAN) IS
  '取消配送訂單的唯一入口：退品項回倉庫、退代幣、發通知。後台取消與綠界退貨 callback 都走這支，不要各自寫一份。';

REVOKE ALL ON FUNCTION public.cancel_delivery_order(BIGINT, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
