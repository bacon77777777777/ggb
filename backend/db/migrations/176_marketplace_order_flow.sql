BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'marketplace_orders') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'marketplace_orders' AND column_name = 'paid_at'
    ) THEN
      ALTER TABLE public.marketplace_orders ADD COLUMN paid_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'marketplace_orders' AND column_name = 'payment_proof_urls'
    ) THEN
      ALTER TABLE public.marketplace_orders ADD COLUMN payment_proof_urls TEXT[] DEFAULT ARRAY[]::TEXT[];
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'marketplace_orders' AND column_name = 'seller_confirmed_at'
    ) THEN
      ALTER TABLE public.marketplace_orders ADD COLUMN seller_confirmed_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'marketplace_orders' AND column_name = 'tracking_number'
    ) THEN
      ALTER TABLE public.marketplace_orders ADD COLUMN tracking_number TEXT;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'marketplace_orders' AND column_name = 'shipped_at'
    ) THEN
      ALTER TABLE public.marketplace_orders ADD COLUMN shipped_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'marketplace_orders' AND column_name = 'received_at'
    ) THEN
      ALTER TABLE public.marketplace_orders ADD COLUMN received_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'marketplace_orders' AND column_name = 'completed_at'
    ) THEN
      ALTER TABLE public.marketplace_orders ADD COLUMN completed_at TIMESTAMPTZ;
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.marketplace_order_mark_paid(
  p_order_id BIGINT,
  p_proof_urls TEXT[]
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_order RECORD;
  v_seller UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'login_required');
  END IF;

  SELECT * INTO v_order
  FROM public.marketplace_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'order_not_found');
  END IF;

  IF v_order.cancelled THEN
    RETURN jsonb_build_object('success', false, 'message', 'cancelled');
  END IF;

  IF v_order.buyer_id <> v_uid THEN
    RETURN jsonb_build_object('success', false, 'message', 'forbidden');
  END IF;

  IF v_order.step <> 1 THEN
    RETURN jsonb_build_object('success', false, 'message', 'invalid_step');
  END IF;

  v_seller := v_order.seller_id;

  UPDATE public.marketplace_orders
  SET step = 2,
      paid_at = NOW(),
      payment_proof_urls = COALESCE(p_proof_urls, ARRAY[]::TEXT[]),
      updated_at = NOW()
  WHERE id = p_order_id;

  INSERT INTO public.marketplace_messages (listing_id, sender_id, receiver_id, kind, body)
  VALUES (v_order.listing_id, v_uid, v_seller, 'system', '買家已標記付款');

  INSERT INTO notifications (user_id, type, title, body, link, meta)
  VALUES (
    v_seller,
    'marketplace_order',
    '販售訂單',
    '買家已標記付款',
    '/sell-orders/' || p_order_id::text,
    jsonb_build_object('order_id', p_order_id, 'listing_id', v_order.listing_id, 'buyer_id', v_uid)
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

ALTER FUNCTION public.marketplace_order_mark_paid(BIGINT, TEXT[]) SET row_security = off;

CREATE OR REPLACE FUNCTION public.marketplace_order_confirm_payment(
  p_order_id BIGINT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_order RECORD;
  v_buyer UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'login_required');
  END IF;

  SELECT * INTO v_order
  FROM public.marketplace_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'order_not_found');
  END IF;

  IF v_order.cancelled THEN
    RETURN jsonb_build_object('success', false, 'message', 'cancelled');
  END IF;

  IF v_order.seller_id <> v_uid THEN
    RETURN jsonb_build_object('success', false, 'message', 'forbidden');
  END IF;

  IF v_order.step <> 2 THEN
    RETURN jsonb_build_object('success', false, 'message', 'invalid_step');
  END IF;

  v_buyer := v_order.buyer_id;

  UPDATE public.marketplace_orders
  SET step = 3,
      seller_confirmed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_order_id;

  INSERT INTO public.marketplace_messages (listing_id, sender_id, receiver_id, kind, body)
  VALUES (v_order.listing_id, v_uid, v_buyer, 'system', '賣家已確認收款');

  INSERT INTO notifications (user_id, type, title, body, link, meta)
  VALUES (
    v_buyer,
    'marketplace_order',
    '販售訂單',
    '賣家已確認收款',
    '/sell-orders/' || p_order_id::text,
    jsonb_build_object('order_id', p_order_id, 'listing_id', v_order.listing_id, 'seller_id', v_uid)
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

ALTER FUNCTION public.marketplace_order_confirm_payment(BIGINT) SET row_security = off;

CREATE OR REPLACE FUNCTION public.marketplace_order_mark_shipped(
  p_order_id BIGINT,
  p_tracking_number TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_order RECORD;
  v_buyer UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'login_required');
  END IF;

  SELECT * INTO v_order
  FROM public.marketplace_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'order_not_found');
  END IF;

  IF v_order.cancelled THEN
    RETURN jsonb_build_object('success', false, 'message', 'cancelled');
  END IF;

  IF v_order.seller_id <> v_uid THEN
    RETURN jsonb_build_object('success', false, 'message', 'forbidden');
  END IF;

  IF v_order.step <> 3 THEN
    RETURN jsonb_build_object('success', false, 'message', 'invalid_step');
  END IF;

  v_buyer := v_order.buyer_id;

  UPDATE public.marketplace_orders
  SET step = 4,
      tracking_number = NULLIF(p_tracking_number, ''),
      shipped_at = NOW(),
      updated_at = NOW()
  WHERE id = p_order_id;

  INSERT INTO public.marketplace_messages (listing_id, sender_id, receiver_id, kind, body)
  VALUES (v_order.listing_id, v_uid, v_buyer, 'system', '賣家已標記出貨');

  INSERT INTO notifications (user_id, type, title, body, link, meta)
  VALUES (
    v_buyer,
    'marketplace_order',
    '販售訂單',
    '賣家已標記出貨',
    '/sell-orders/' || p_order_id::text,
    jsonb_build_object('order_id', p_order_id, 'listing_id', v_order.listing_id, 'seller_id', v_uid)
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

ALTER FUNCTION public.marketplace_order_mark_shipped(BIGINT, TEXT) SET row_security = off;

CREATE OR REPLACE FUNCTION public.marketplace_order_confirm_received(
  p_order_id BIGINT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_order RECORD;
  v_seller UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'login_required');
  END IF;

  SELECT * INTO v_order
  FROM public.marketplace_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'order_not_found');
  END IF;

  IF v_order.cancelled THEN
    RETURN jsonb_build_object('success', false, 'message', 'cancelled');
  END IF;

  IF v_order.buyer_id <> v_uid THEN
    RETURN jsonb_build_object('success', false, 'message', 'forbidden');
  END IF;

  IF v_order.step <> 4 THEN
    RETURN jsonb_build_object('success', false, 'message', 'invalid_step');
  END IF;

  v_seller := v_order.seller_id;

  UPDATE public.marketplace_orders
  SET step = 5,
      received_at = NOW(),
      completed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_order_id;

  INSERT INTO public.marketplace_messages (listing_id, sender_id, receiver_id, kind, body)
  VALUES (v_order.listing_id, v_uid, v_seller, 'system', '買家已確認收貨，交易完成');

  INSERT INTO notifications (user_id, type, title, body, link, meta)
  VALUES (
    v_seller,
    'marketplace_order',
    '販售訂單',
    '買家已確認收貨',
    '/sell-orders/' || p_order_id::text,
    jsonb_build_object('order_id', p_order_id, 'listing_id', v_order.listing_id, 'buyer_id', v_uid)
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

ALTER FUNCTION public.marketplace_order_confirm_received(BIGINT) SET row_security = off;

CREATE OR REPLACE FUNCTION public.notify_marketplace_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text;
  v_body text;
  v_link text;
BEGIN
  IF NEW.receiver_id IS NULL THEN
    RETURN NEW;
  END IF;
  v_title := '販售私聊';
  v_body := COALESCE(NULLIF(NEW.body, ''), '收到新訊息');
  v_link := '/sell-messages/' || NEW.listing_id::text || '--' || NEW.sender_id::text;

  INSERT INTO notifications (user_id, type, title, body, link, meta)
  VALUES (
    NEW.receiver_id,
    'marketplace_message',
    v_title,
    left(v_body, 120),
    v_link,
    jsonb_build_object('listing_id', NEW.listing_id, 'sender_id', NEW.sender_id)
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_marketplace_message() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_notify_marketplace_message ON public.marketplace_messages;
CREATE TRIGGER trg_notify_marketplace_message
AFTER INSERT ON public.marketplace_messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_marketplace_message();

NOTIFY pgrst, 'reload schema';

COMMIT;

