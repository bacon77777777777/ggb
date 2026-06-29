BEGIN;

UPDATE public.users
SET name = '小菜雞-' || right(id::text, 4)
WHERE (name IS NULL OR btrim(name) = '');

CREATE OR REPLACE FUNCTION public.set_default_user_name_small_chicken()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.name IS NULL OR btrim(NEW.name) = '' THEN
    NEW.name := '小菜雞-' || right(NEW.id::text, 4);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_default_user_name_small_chicken ON public.users;
CREATE TRIGGER trg_set_default_user_name_small_chicken
BEFORE INSERT ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.set_default_user_name_small_chicken();

COMMIT;

