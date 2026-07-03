-- Remove old integer[] overload that conflicts with the correct bigint[] version.
-- draw_records.id is bigint, so only the bigint[] signature should exist.
DROP FUNCTION IF EXISTS public.dismantle_prizes(p_record_ids integer[], p_user_id uuid);
