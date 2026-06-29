-- Drop old versions of play_gacha and play_ichiban to resolve ambiguity
-- and ensure the latest logic (with points/coupons support) is always used.

-- Drop old play_gacha signatures
DROP FUNCTION IF EXISTS public.play_gacha(BIGINT, INTEGER);
DROP FUNCTION IF EXISTS public.play_gacha(BIGINT, INTEGER, BOOLEAN);

-- Drop old play_ichiban signatures
DROP FUNCTION IF EXISTS public.play_ichiban(BIGINT, INTEGER[]);
DROP FUNCTION IF EXISTS public.play_ichiban(BIGINT, INTEGER[], BOOLEAN);

-- Note: The latest versions with full signatures (including defaults) must exist.
-- They are defined in migration 131:
-- play_ichiban(BIGINT, INTEGER[], BOOLEAN DEFAULT FALSE, UUID DEFAULT NULL)
-- play_gacha(BIGINT, INTEGER, BOOLEAN DEFAULT FALSE, UUID DEFAULT NULL)
