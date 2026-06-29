BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'marketplace_transactions') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'marketplace_transactions' AND column_name = 'item_index'
    ) THEN
      ALTER TABLE public.marketplace_transactions ADD COLUMN item_index INTEGER;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'marketplace_transactions' AND column_name = 'item_name'
    ) THEN
      ALTER TABLE public.marketplace_transactions ADD COLUMN item_name TEXT;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'marketplace_transactions' AND column_name = 'quantity'
    ) THEN
      ALTER TABLE public.marketplace_transactions ADD COLUMN quantity INTEGER;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'marketplace_transactions' AND column_name = 'unit_price'
    ) THEN
      ALTER TABLE public.marketplace_transactions ADD COLUMN unit_price INTEGER;
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.purchase_marketplace_listing_item(
  p_listing_id BIGINT,
  p_item_index INTEGER,
  p_quantity INTEGER
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
  v_items_len INTEGER;
  v_available INTEGER;
  v_new_qty INTEGER;
  v_unit_price INTEGER;
  v_total_price INTEGER;
  v_buyer_tokens INTEGER;
  v_fee INTEGER;
  v_seller_receive INTEGER;
  v_item_name TEXT;
  v_all_sold BOOLEAN;
BEGIN
  v_buyer_id := auth.uid();
  IF v_buyer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'login_required');
  END IF;

  IF p_quantity IS NULL OR p_quantity < 1 THEN
    RETURN jsonb_build_object('success', false, 'message', 'invalid_quantity');
  END IF;

  SELECT * INTO v_listing
  FROM public.marketplace_listings
  WHERE id = p_listing_id AND status = 'active'
  FOR UPDATE;

  IF v_listing IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'listing_not_found');
  END IF;

  v_items := COALESCE(v_listing.items, '[]'::jsonb);
  IF jsonb_typeof(v_items) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'message', 'invalid_items');
  END IF;

  v_items_len := jsonb_array_length(v_items);
  IF p_item_index IS NULL OR p_item_index < 0 OR p_item_index >= v_items_len THEN
    RETURN jsonb_build_object('success', false, 'message', 'invalid_item');
  END IF;

  v_item := v_items -> p_item_index;
  v_available := COALESCE(NULLIF((v_item ->> 'quantity'), '')::int, 1);
  IF v_available < p_quantity THEN
    RETURN jsonb_build_object('success', false, 'message', 'insufficient_stock');
  END IF;

  v_unit_price := COALESCE(v_listing.price, 0);
  IF v_unit_price <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'invalid_price');
  END IF;

  v_total_price := v_unit_price * p_quantity;
  SELECT tokens INTO v_buyer_tokens FROM public.users WHERE id = v_buyer_id;
  IF v_buyer_tokens IS NULL OR v_buyer_tokens < v_total_price THEN
    RETURN jsonb_build_object('success', false, 'message', 'insufficient_tokens');
  END IF;

  v_fee := FLOOR(v_total_price * 0.05);
  v_seller_receive := v_total_price - v_fee;

  UPDATE public.users SET tokens = tokens - v_total_price WHERE id = v_buyer_id;
  UPDATE public.users SET tokens = tokens + v_seller_receive WHERE id = v_listing.seller_id;

  v_new_qty := v_available - p_quantity;
  v_items := jsonb_set(
    v_items,
    ARRAY[p_item_index::text, 'quantity'],
    to_jsonb(v_new_qty),
    true
  );

  v_item_name := COALESCE(NULLIF((v_item ->> 'name'), ''), '未知卡片');

  UPDATE public.marketplace_listings
  SET items = v_items, updated_at = NOW()
  WHERE id = p_listing_id;

  SELECT NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_items) AS e
    WHERE COALESCE(NULLIF((e->>'quantity'), '')::int, 1) > 0
  ) INTO v_all_sold;

  IF v_all_sold THEN
    UPDATE public.marketplace_listings
    SET status = 'sold', updated_at = NOW()
    WHERE id = p_listing_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'marketplace_transactions') THEN
    INSERT INTO public.marketplace_transactions (
      listing_id, buyer_id, seller_id, draw_record_id, price, fee, seller_receive, item_index, item_name, quantity, unit_price
    ) VALUES (
      p_listing_id, v_buyer_id, v_listing.seller_id, v_listing.draw_record_id, v_total_price, v_fee, v_seller_receive,
      p_item_index, v_item_name, p_quantity, v_unit_price
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Purchase successful');
END;
$$;

ALTER FUNCTION public.purchase_marketplace_listing_item(BIGINT, INTEGER, INTEGER) SET row_security = off;

NOTIFY pgrst, 'reload schema';

COMMIT;

