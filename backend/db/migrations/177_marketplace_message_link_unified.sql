BEGIN;

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
  v_link := '/messages/sell:' || NEW.listing_id::text || '--' || NEW.sender_id::text;

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

ALTER FUNCTION public.notify_marketplace_message() SET row_security = off;

DROP TRIGGER IF EXISTS trg_notify_marketplace_message ON public.marketplace_messages;
CREATE TRIGGER trg_notify_marketplace_message
AFTER INSERT ON public.marketplace_messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_marketplace_message();

NOTIFY pgrst, 'reload schema';

COMMIT;

