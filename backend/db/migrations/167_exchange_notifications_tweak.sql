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
  v_body := CASE
    WHEN NEW.kind = 'offer' THEN '交換小卡'
    WHEN NEW.kind = 'system' THEN COALESCE(NULLIF(NEW.body, ''), '系統訊息')
    ELSE COALESCE(NULLIF(NEW.body, ''), '收到新訊息')
  END;
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

COMMIT;

