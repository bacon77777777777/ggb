BEGIN;

CREATE OR REPLACE FUNCTION public.notify_exchange_message()
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

  v_title := '交換私訊';
  v_body := COALESCE(NULLIF(NEW.body, ''), '收到新訊息');
  v_link := '/messages/' || NEW.offer_id::text || '--' || NEW.sender_id::text;

  INSERT INTO notifications (user_id, type, title, body, link, meta)
  VALUES (
    NEW.receiver_id,
    'exchange_message',
    v_title,
    left(v_body, 120),
    v_link,
    jsonb_build_object('offer_id', NEW.offer_id, 'order_id', NEW.order_id, 'sender_id', NEW.sender_id)
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_exchange_message() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_notify_exchange_message ON exchange_messages;
CREATE TRIGGER trg_notify_exchange_message
AFTER INSERT ON exchange_messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_exchange_message();

CREATE OR REPLACE FUNCTION public.notify_exchange_order_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO notifications (user_id, type, title, body, link, meta)
  VALUES
  (
    NEW.owner_id,
    'exchange_order_started',
    '有人啟動交換',
    '點我查看交換進度',
    '/exchange-orders/' || NEW.id::text,
    jsonb_build_object('offer_id', NEW.offer_id, 'order_id', NEW.id, 'initiator_id', NEW.initiator_id)
  ),
  (
    NEW.initiator_id,
    'exchange_order_started',
    '交換已啟動',
    '點我查看交換進度',
    '/exchange-orders/' || NEW.id::text,
    jsonb_build_object('offer_id', NEW.offer_id, 'order_id', NEW.id, 'owner_id', NEW.owner_id)
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_exchange_order_insert() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_notify_exchange_order_insert ON exchange_orders;
CREATE TRIGGER trg_notify_exchange_order_insert
AFTER INSERT ON exchange_orders
FOR EACH ROW
EXECUTE FUNCTION public.notify_exchange_order_insert();

CREATE OR REPLACE FUNCTION public.notify_exchange_order_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_step_title text;
  v_owner_track_new text;
  v_owner_track_old text;
  v_init_track_new text;
  v_init_track_old text;
  v_owner_rating_new boolean;
  v_owner_rating_old boolean;
  v_init_rating_new boolean;
  v_init_rating_old boolean;
  v_owner_receipt_new_len int;
  v_owner_receipt_old_len int;
  v_init_receipt_new_len int;
  v_init_receipt_old_len int;
BEGIN
  IF NEW.cancelled IS TRUE AND COALESCE(OLD.cancelled, FALSE) IS FALSE THEN
    INSERT INTO notifications (user_id, type, title, body, link, meta)
    VALUES
    (
      NEW.owner_id,
      'exchange_order_cancelled',
      '交換已取消',
      '此交換已被取消',
      '/exchange-orders/' || NEW.id::text,
      jsonb_build_object('offer_id', NEW.offer_id, 'order_id', NEW.id)
    ),
    (
      NEW.initiator_id,
      'exchange_order_cancelled',
      '交換已取消',
      '此交換已被取消',
      '/exchange-orders/' || NEW.id::text,
      jsonb_build_object('offer_id', NEW.offer_id, 'order_id', NEW.id)
    );
  END IF;

  IF NEW.step IS DISTINCT FROM OLD.step THEN
    v_step_title :=
      CASE NEW.step
        WHEN 2 THEN '交換已進入確認'
        WHEN 3 THEN '交換已進入寄出'
        WHEN 4 THEN '交換已進入收件'
        WHEN 5 THEN '交換已完成'
        ELSE '交換狀態更新'
      END;

    INSERT INTO notifications (user_id, type, title, body, link, meta)
    VALUES
    (
      NEW.owner_id,
      'exchange_order_step',
      v_step_title,
      '點我查看交換進度',
      '/exchange-orders/' || NEW.id::text,
      jsonb_build_object('offer_id', NEW.offer_id, 'order_id', NEW.id, 'step', NEW.step)
    ),
    (
      NEW.initiator_id,
      'exchange_order_step',
      v_step_title,
      '點我查看交換進度',
      '/exchange-orders/' || NEW.id::text,
      jsonb_build_object('offer_id', NEW.offer_id, 'order_id', NEW.id, 'step', NEW.step)
    );
  END IF;

  v_owner_track_new := COALESCE(NULLIF(NEW.tracking_numbers->>'owner', ''), '');
  v_owner_track_old := COALESCE(NULLIF(OLD.tracking_numbers->>'owner', ''), '');
  IF v_owner_track_new <> '' AND v_owner_track_old = '' THEN
    INSERT INTO notifications (user_id, type, title, body, link, meta)
    VALUES (
      NEW.initiator_id,
      'exchange_tracking',
      '對方已填寫物流編號',
      '點我查看物流資訊',
      '/exchange-orders/' || NEW.id::text,
      jsonb_build_object('offer_id', NEW.offer_id, 'order_id', NEW.id)
    );
  END IF;

  v_init_track_new := COALESCE(NULLIF(NEW.tracking_numbers->>'initiator', ''), '');
  v_init_track_old := COALESCE(NULLIF(OLD.tracking_numbers->>'initiator', ''), '');
  IF v_init_track_new <> '' AND v_init_track_old = '' THEN
    INSERT INTO notifications (user_id, type, title, body, link, meta)
    VALUES (
      NEW.owner_id,
      'exchange_tracking',
      '對方已填寫物流編號',
      '點我查看物流資訊',
      '/exchange-orders/' || NEW.id::text,
      jsonb_build_object('offer_id', NEW.offer_id, 'order_id', NEW.id)
    );
  END IF;

  v_owner_rating_new := COALESCE((NEW.ratings->'owner'->>'submitted')::boolean, false);
  v_owner_rating_old := COALESCE((OLD.ratings->'owner'->>'submitted')::boolean, false);
  IF v_owner_rating_new IS TRUE AND v_owner_rating_old IS FALSE THEN
    INSERT INTO notifications (user_id, type, title, body, link, meta)
    VALUES (
      NEW.initiator_id,
      'exchange_rating',
      '對方已送出評價',
      '點我查看交換結果',
      '/exchange-orders/' || NEW.id::text,
      jsonb_build_object('offer_id', NEW.offer_id, 'order_id', NEW.id)
    );
  END IF;

  v_init_rating_new := COALESCE((NEW.ratings->'initiator'->>'submitted')::boolean, false);
  v_init_rating_old := COALESCE((OLD.ratings->'initiator'->>'submitted')::boolean, false);
  IF v_init_rating_new IS TRUE AND v_init_rating_old IS FALSE THEN
    INSERT INTO notifications (user_id, type, title, body, link, meta)
    VALUES (
      NEW.owner_id,
      'exchange_rating',
      '對方已送出評價',
      '點我查看交換結果',
      '/exchange-orders/' || NEW.id::text,
      jsonb_build_object('offer_id', NEW.offer_id, 'order_id', NEW.id)
    );
  END IF;

  v_owner_receipt_new_len := COALESCE(jsonb_array_length(NEW.receipt_media->'owner'->'media'), 0);
  v_owner_receipt_old_len := COALESCE(jsonb_array_length(OLD.receipt_media->'owner'->'media'), 0);
  IF v_owner_receipt_new_len > 0 AND v_owner_receipt_new_len > v_owner_receipt_old_len THEN
    INSERT INTO notifications (user_id, type, title, body, link, meta)
    VALUES (
      NEW.initiator_id,
      'exchange_receipt',
      '對方已上傳收件證明',
      '點我查看收件證明',
      '/exchange-orders/' || NEW.id::text,
      jsonb_build_object('offer_id', NEW.offer_id, 'order_id', NEW.id)
    );
  END IF;

  v_init_receipt_new_len := COALESCE(jsonb_array_length(NEW.receipt_media->'initiator'->'media'), 0);
  v_init_receipt_old_len := COALESCE(jsonb_array_length(OLD.receipt_media->'initiator'->'media'), 0);
  IF v_init_receipt_new_len > 0 AND v_init_receipt_new_len > v_init_receipt_old_len THEN
    INSERT INTO notifications (user_id, type, title, body, link, meta)
    VALUES (
      NEW.owner_id,
      'exchange_receipt',
      '對方已上傳收件證明',
      '點我查看收件證明',
      '/exchange-orders/' || NEW.id::text,
      jsonb_build_object('offer_id', NEW.offer_id, 'order_id', NEW.id)
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_exchange_order_update() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_notify_exchange_order_update ON exchange_orders;
CREATE TRIGGER trg_notify_exchange_order_update
AFTER UPDATE ON exchange_orders
FOR EACH ROW
EXECUTE FUNCTION public.notify_exchange_order_update();

COMMIT;

