BEGIN;

ALTER FUNCTION public.notify_exchange_message() SET row_security = off;
ALTER FUNCTION public.notify_exchange_order_insert() SET row_security = off;
ALTER FUNCTION public.notify_exchange_order_update() SET row_security = off;

COMMIT;

