BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER FUNCTION public.play_gacha(BIGINT, INTEGER, BOOLEAN, UUID)
SET search_path = public, extensions;

COMMIT;

