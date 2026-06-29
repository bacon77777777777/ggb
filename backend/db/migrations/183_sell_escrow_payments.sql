BEGIN;

ALTER TABLE public.sell_orders
  ADD COLUMN IF NOT EXISTS order_number TEXT,
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS newebpay_payment_type TEXT,
  ADD COLUMN IF NOT EXISTS newebpay_trade_no TEXT,
  ADD COLUMN IF NOT EXISTS newebpay_raw JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'sell_orders'
      AND indexname = 'sell_orders_order_number_key'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX sell_orders_order_number_key ON public.sell_orders(order_number) WHERE order_number IS NOT NULL';
  END IF;
END
$$;

ALTER TABLE public.sell_orders
  DROP CONSTRAINT IF EXISTS sell_orders_payment_method_check;

ALTER TABLE public.sell_orders
  ADD CONSTRAINT sell_orders_payment_method_check
  CHECK (payment_method IN ('transfer','private','escrow'));

ALTER TABLE public.sell_orders
  DROP CONSTRAINT IF EXISTS sell_orders_payment_status_check;

ALTER TABLE public.sell_orders
  ADD CONSTRAINT sell_orders_payment_status_check
  CHECK (payment_status IN ('unpaid','pending','paid','failed','cancelled'));

UPDATE public.sell_orders
SET payment_status =
  CASE
    WHEN cancelled THEN 'cancelled'
    WHEN paid_at IS NOT NULL OR step >= 2 THEN 'paid'
    ELSE 'unpaid'
  END
WHERE payment_status IS NULL OR payment_status NOT IN ('unpaid','pending','paid','failed','cancelled');

DROP POLICY IF EXISTS "Sell listings - public read active" ON public.sell_listings;
CREATE POLICY "Sell listings - public read active"
  ON public.sell_listings
  FOR SELECT
  USING (
    status = 'active'
    OR seller_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.sell_orders o
      WHERE o.listing_id = sell_listings.id
        AND o.buyer_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public._gen_sell_order_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_number TEXT;
BEGIN
  v_order_number := 'SO' || to_char(now(), 'YYMMDD') || lpad(floor(random() * 10000)::text, 4, '0');
  RETURN v_order_number;
END;
$$;

ALTER FUNCTION public._gen_sell_order_number() SET row_security = off;

CREATE OR REPLACE FUNCTION public.ensure_sell_order_number(
  p_order_id BIGINT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_order RECORD;
  v_order_number TEXT;
  v_try INT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'login_required');
  END IF;

  SELECT * INTO v_order
  FROM public.sell_orders
  WHERE id = p_order_id AND buyer_id = v_uid
  FOR UPDATE;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'order_not_found');
  END IF;

  IF v_order.order_number IS NOT NULL AND v_order.order_number <> '' THEN
    RETURN jsonb_build_object('success', true, 'order_number', v_order.order_number);
  END IF;

  v_try := 0;
  LOOP
    v_try := v_try + 1;
    v_order_number := public._gen_sell_order_number();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.sell_orders WHERE order_number = v_order_number);
    IF v_try >= 10 THEN
      RETURN jsonb_build_object('success', false, 'message', 'order_number_generation_failed');
    END IF;
  END LOOP;

  UPDATE public.sell_orders
  SET order_number = v_order_number, updated_at = NOW()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'order_number', v_order_number);
END;
$$;

ALTER FUNCTION public.ensure_sell_order_number(BIGINT) SET row_security = off;
GRANT EXECUTE ON FUNCTION public.ensure_sell_order_number(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_sell_order_number(BIGINT) TO service_role;

CREATE OR REPLACE FUNCTION public.confirm_sell_escrow_order(
  p_order_number TEXT,
  p_payment_type TEXT DEFAULT NULL,
  p_trade_no TEXT DEFAULT NULL,
  p_raw JSONB DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
BEGIN
  IF p_order_number IS NULL OR p_order_number = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'missing_order_number');
  END IF;

  SELECT * INTO v_order
  FROM public.sell_orders
  WHERE order_number = p_order_number
    AND payment_method = 'escrow'
    AND cancelled = false
  FOR UPDATE;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'order_not_found');
  END IF;

  IF v_order.payment_status = 'paid' OR v_order.paid_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'order_id', v_order.id, 'message', 'already_paid');
  END IF;

  UPDATE public.sell_orders
  SET payment_status = 'paid',
      paid_at = NOW(),
      step = 3,
      seller_confirmed_at = COALESCE(seller_confirmed_at, NOW()),
      newebpay_payment_type = COALESCE(p_payment_type, newebpay_payment_type),
      newebpay_trade_no = COALESCE(p_trade_no, newebpay_trade_no),
      newebpay_raw = COALESCE(p_raw, newebpay_raw),
      updated_at = NOW()
  WHERE id = v_order.id;

  INSERT INTO public.sell_messages (listing_id, sender_id, receiver_id, kind, body)
  VALUES (v_order.listing_id, v_order.buyer_id, v_order.seller_id, 'system', '已付款（平台代收）');

  RETURN jsonb_build_object('success', true, 'order_id', v_order.id);
END;
$$;

ALTER FUNCTION public.confirm_sell_escrow_order(TEXT, TEXT, TEXT, JSONB) SET row_security = off;
GRANT EXECUTE ON FUNCTION public.confirm_sell_escrow_order(TEXT, TEXT, TEXT, JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.create_sell_order(
  p_listing_id BIGINT,
  p_item_index INTEGER,
  p_quantity INTEGER,
  p_payment_method TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_buyer_id UUID;
  v_listing RECORD;
  v_items JSONB;
  v_item JSONB;
  v_len INTEGER;
  v_available INTEGER;
  v_new_qty INTEGER;
  v_unit_price INTEGER;
  v_method TEXT;
  v_order_id BIGINT;
  v_all_sold BOOLEAN;
  v_order_number TEXT;
  v_try INT;
  v_payment_status TEXT;
BEGIN
  v_buyer_id := auth.uid();
  IF v_buyer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'login_required');
  END IF;

  IF p_quantity IS NULL OR p_quantity < 1 THEN
    RETURN jsonb_build_object('success', false, 'message', 'invalid_quantity');
  END IF;

  v_method := COALESCE(NULLIF(p_payment_method, ''), 'transfer');
  IF v_method NOT IN ('transfer','private','escrow') THEN
    RETURN jsonb_build_object('success', false, 'message', 'invalid_payment_method');
  END IF;

  SELECT * INTO v_listing
  FROM public.sell_listings
  WHERE id = p_listing_id AND status = 'active'
  FOR UPDATE;

  IF v_listing IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'listing_not_found');
  END IF;

  IF v_listing.seller_id = v_buyer_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'cannot_buy_own_listing');
  END IF;

  v_items := COALESCE(v_listing.items, '[]'::jsonb);
  IF jsonb_typeof(v_items) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'message', 'invalid_items');
  END IF;

  v_len := jsonb_array_length(v_items);
  IF p_item_index IS NULL OR p_item_index < 0 OR p_item_index >= v_len THEN
    RETURN jsonb_build_object('success', false, 'message', 'invalid_item');
  END IF;

  v_item := v_items -> p_item_index;
  v_available := COALESCE(NULLIF((v_item ->> 'quantity'), '')::int, 0);
  IF v_available < p_quantity THEN
    RETURN jsonb_build_object('success', false, 'message', 'insufficient_stock');
  END IF;

  v_unit_price := COALESCE(NULLIF((v_item ->> 'price'), '')::int, v_listing.price, 0);
  IF v_unit_price <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'invalid_price');
  END IF;

  v_new_qty := v_available - p_quantity;
  v_items := jsonb_set(v_items, ARRAY[p_item_index::text, 'quantity'], to_jsonb(v_new_qty), true);

  UPDATE public.sell_listings
  SET items = v_items, updated_at = NOW()
  WHERE id = p_listing_id;

  SELECT NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_items) AS e
    WHERE COALESCE(NULLIF((e->>'quantity'), '')::int, 0) > 0
  ) INTO v_all_sold;

  IF v_all_sold THEN
    UPDATE public.sell_listings
    SET status = 'sold', updated_at = NOW()
    WHERE id = p_listing_id;
  END IF;

  v_order_number := NULL;
  v_payment_status := 'unpaid';
  IF v_method = 'escrow' THEN
    v_try := 0;
    LOOP
      v_try := v_try + 1;
      v_order_number := public._gen_sell_order_number();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.sell_orders WHERE order_number = v_order_number);
      IF v_try >= 10 THEN
        RETURN jsonb_build_object('success', false, 'message', 'order_number_generation_failed');
      END IF;
    END LOOP;
    v_payment_status := 'pending';
  END IF;

  INSERT INTO public.sell_orders (
    listing_id, seller_id, buyer_id, item_index, quantity, unit_price, payment_method, payment_status, order_number, step, cancelled
  ) VALUES (
    p_listing_id, v_listing.seller_id, v_buyer_id, p_item_index, p_quantity, v_unit_price, v_method, v_payment_status, v_order_number, 1, false
  ) RETURNING id INTO v_order_id;

  INSERT INTO public.sell_messages (listing_id, sender_id, receiver_id, kind, body)
  VALUES (p_listing_id, v_buyer_id, v_listing.seller_id, 'system', '已建立訂單');

  RETURN jsonb_build_object('success', true, 'order_id', v_order_id, 'order_number', v_order_number);
END;
$$;

ALTER FUNCTION public.create_sell_order(BIGINT, INTEGER, INTEGER, TEXT) SET row_security = off;
GRANT EXECUTE ON FUNCTION public.create_sell_order(BIGINT, INTEGER, INTEGER, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
