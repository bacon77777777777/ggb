BEGIN;

ALTER FUNCTION public.get_user_displays(uuid[]) SET row_security = off;

COMMIT;

