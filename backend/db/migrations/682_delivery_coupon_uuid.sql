-- 682: 運費優惠券的 key 型別修正（2026-09-02）
--
-- 681 把 p_coupon_id／orders.coupon_id 宣告成 bigint，但 user_coupons.id 是 uuid ——
-- 帶券呼叫時 `uc.id = p_coupon_id` 直接型別錯誤，前端也因 Number(uuid)=NaN 選不到券。
-- orders.coupon_id 尚無任何資料（681 之後還沒有訂單用過券），直接換型別。

ALTER TABLE public.orders ALTER COLUMN coupon_id TYPE uuid USING NULL::uuid;

-- 換簽章：先移除 681 的 bigint 版本（含預設值的兩個參數讓舊簽章樣態唯一）
DROP FUNCTION IF EXISTS public.create_delivery_order(uuid, text, text, text, text, text, text, text, bigint[], integer, text, bigint);

CREATE OR REPLACE FUNCTION public.create_delivery_order(p_user_id uuid, p_recipient_name text, p_recipient_phone text, p_address text, p_logistics_type text, p_logistics_subtype text, p_store_id text, p_store_name text, p_draw_record_ids bigint[], p_delivery_fee_points integer, p_note text DEFAULT NULL, p_coupon_id uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_order_id BIGINT;
  v_order_number VARCHAR(50);
  v_new_balance INTEGER;
  v_block_count INTEGER;
  v_current_points INTEGER;
  v_item_count INTEGER;
  v_has_large BOOLEAN;
  v_fee INTEGER;
  v_discount INTEGER := 0;
  v_coupon RECORD;
  v_purchase INTEGER;
  v_charge INTEGER;
  v_supplier_count INTEGER;
  v_supplier_id BIGINT;
BEGIN
  /*
   * 收件資料格式（老闆 2026-08-24 指定；前台同步驗證，這裡是「直接打 RPC 也擋得住」的那道）：
   *   姓名 2–10 個字（去頭尾空白）
   *   電話 台灣手機：09 開頭共 10 碼數字
   *   宅配地址 8–60 個字、必須含「縣」或「市」
   */
  IF length(btrim(coalesce(p_recipient_name, ''))) NOT BETWEEN 2 AND 10 THEN
    RAISE EXCEPTION 'INVALID_RECIPIENT_NAME';
  END IF;
  IF btrim(coalesce(p_recipient_phone, '')) !~ '^09[0-9]{8}$' THEN
    RAISE EXCEPTION 'INVALID_RECIPIENT_PHONE';
  END IF;
  IF p_logistics_type = 'HOME' AND (
       length(btrim(coalesce(p_address, ''))) NOT BETWEEN 8 AND 60
       OR btrim(p_address) !~ '(縣|市)'
     ) THEN
    RAISE EXCEPTION 'INVALID_ADDRESS';
  END IF;

  SELECT COUNT(1) INTO v_block_count
  FROM draw_records dr
  JOIN products p ON p.id = dr.product_id
  WHERE dr.id = ANY(p_draw_record_ids)
    AND dr.user_id = p_user_id
    AND dr.status = 'in_warehouse'
    AND COALESCE(p.is_preorder, FALSE) = TRUE
    AND (p.preorder_available_at IS NULL OR now() < p.preorder_available_at);

  IF v_block_count > 0 THEN
    RAISE EXCEPTION 'PREORDER_NOT_AVAILABLE';
  END IF;

  -- 只算確實屬於本人且仍在倉庫的品項，否則帶一串不存在的 id 就能湊到免運門檻
  SELECT COUNT(1) INTO v_item_count
  FROM draw_records
  WHERE id = ANY(p_draw_record_ids) AND user_id = p_user_id AND status = 'in_warehouse';

  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'NO_DELIVERABLE_ITEMS';
  END IF;

  /*
   * 一張訂單只能有一家廠商的貨。判斷對象跟 v_item_count 一樣，只看「確實屬於本人
   * 且仍在倉庫」的那些 —— 帶一串別人的 id 進來不該影響廠商判定。
   * supplier_id 是 NULL 的舊商品算同一組（NULL 之間視為相同），不因為資料沒補齊就擋住出貨。
   */
  SELECT COUNT(DISTINCT COALESCE(p.supplier_id, -1)), MIN(p.supplier_id)
    INTO v_supplier_count, v_supplier_id
  FROM draw_records dr
  JOIN products p ON p.id = dr.product_id
  WHERE dr.id = ANY(p_draw_record_ids)
    AND dr.user_id = p_user_id
    AND dr.status = 'in_warehouse';

  IF v_supplier_count > 1 THEN
    RAISE EXCEPTION 'MULTIPLE_SUPPLIERS';
  END IF;

  v_has_large := public.delivery_has_large_item(p_user_id, p_draw_record_ids);

  -- 含大件強制宅配：前台會擋，但直接打 RPC 的人不會
  IF v_has_large AND p_logistics_type <> 'HOME' THEN
    RAISE EXCEPTION 'LARGE_ITEM_REQUIRES_HOME_DELIVERY';
  END IF;

  v_fee := public.calc_delivery_fee(p_logistics_type, p_logistics_subtype, v_item_count, v_has_large);

  -- 抽籤販售中籤的品項，價金在這一刻才收（抽的時候是 0 元）。
  -- 運費優惠券（2026-09-02）：伺服器端重驗＋原子核銷，前端算的折抵只是顯示
  IF p_coupon_id IS NOT NULL THEN
    SELECT uc.id AS uc_id, c.discount_value INTO v_coupon
    FROM user_coupons uc JOIN coupons c ON c.id = uc.coupon_id
    WHERE uc.id = p_coupon_id AND uc.user_id = p_user_id
      AND uc.status = 'unused'
      AND (uc.expiry_date IS NULL OR uc.expiry_date >= now())
      AND c.scope = 'shipping' AND c.is_active
    FOR UPDATE OF uc;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVALID_COUPON';
    END IF;
    v_discount := LEAST(v_fee, COALESCE(v_coupon.discount_value, 0)::INTEGER);
  END IF;
  v_fee := v_fee - v_discount;

  -- 前端傳來的 p_delivery_fee_points 只涵蓋運費，價金一律由伺服器算，
  -- 不讓前端有機會少報。
  v_purchase := public.lottery_purchase_total(p_user_id, p_draw_record_ids);
  v_charge   := v_fee + v_purchase;

  -- 前端傳來的只當作「畫面顯示的金額」，不一致就擋下請重新取價；
  -- 靜默改價會讓玩家以為被亂扣
  IF COALESCE(p_delivery_fee_points, -1) <> v_fee THEN
    RAISE EXCEPTION 'FEE_MISMATCH: expected %, got %', v_fee, p_delivery_fee_points;
  END IF;

  IF v_charge > 0 THEN
    SELECT COALESCE(tokens, 0) INTO v_current_points FROM users WHERE id = p_user_id;
    IF v_current_points < v_charge THEN
      RAISE EXCEPTION 'INSUFFICIENT_POINTS';
    END IF;
  END IF;

  UPDATE users SET tokens = COALESCE(tokens, 0) - v_charge
  WHERE id = p_user_id RETURNING tokens INTO v_new_balance;

  v_order_number := 'OD' || to_char(now(), 'YYMMDD') || lpad(floor(random() * 10000)::text, 4, '0');

  INSERT INTO orders (
    order_number, user_id, recipient_name, recipient_phone, address,
    status, logistics_type, logistics_subtype, store_id, store_name, shipping_fee,
    note, coupon_id, shipping_discount,
    supplier_id
  ) VALUES (
    v_order_number, p_user_id, p_recipient_name, p_recipient_phone, p_address,
    'submitted', p_logistics_type, p_logistics_subtype, p_store_id, p_store_name, v_fee,
    NULLIF(trim(p_note), ''), p_coupon_id, v_discount,
    v_supplier_id
  ) RETURNING id INTO v_order_id;

  -- 券核銷（原子性：跟訂單同一交易）
  IF p_coupon_id IS NOT NULL THEN
    UPDATE user_coupons SET status = 'used', used_at = now() WHERE id = p_coupon_id;
  END IF;

  -- 運費入帳。不寫的話對帳公式會少這一項，每出一筆貨帳就差一次
  IF v_fee > 0 THEN
    INSERT INTO token_adjustments (user_id, delta, reason, created_by)
    VALUES (p_user_id, -v_fee, format('出貨運費（訂單 %s）', v_order_number), 'system:delivery');
  END IF;

  IF v_purchase > 0 THEN
    INSERT INTO token_adjustments (user_id, delta, reason, created_by)
    VALUES (p_user_id, -v_purchase, format('抽籤販售價金（訂單 %s）', v_order_number), 'system:lottery');
  END IF;

  UPDATE draw_records
  SET status = 'pending_delivery', order_id = v_order_id
  WHERE id = ANY(p_draw_record_ids) AND user_id = p_user_id AND status = 'in_warehouse';

  INSERT INTO notifications (user_id, type, title, body, link, meta)
  VALUES (
    p_user_id, 'order_status', '配送申請已提交',
    format('您的配送申請已提交，訂單編號：%s', v_order_number),
    '/profile?tab=delivery',
    jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number, 'status', 'submitted')
  );

  RETURN jsonb_build_object(
    'success', true, 'order_id', v_order_id,
    'order_number', v_order_number, 'new_balance', v_new_balance,
    'shipping_fee', v_fee,
    'shipping_discount', v_discount,
    'purchase_total', v_purchase
  );
END;
$function$
;
