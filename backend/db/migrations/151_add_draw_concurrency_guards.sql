BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS ux_draw_records_product_ticket
ON public.draw_records (product_id, ticket_number);

CREATE OR REPLACE FUNCTION public.play_ichiban_locked(
  p_product_id BIGINT,
  p_ticket_numbers INTEGER[],
  p_use_points BOOLEAN DEFAULT FALSE,
  p_coupon_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT pg_try_advisory_xact_lock(hashtext('draw:user:' || v_user_id::text)) THEN
    RAISE EXCEPTION 'DRAW_IN_PROGRESS';
  END IF;

  IF NOT pg_try_advisory_xact_lock(hashtext('draw:product:' || p_product_id::text)) THEN
    RAISE EXCEPTION 'PRODUCT_BUSY';
  END IF;

  RETURN public.play_ichiban(p_product_id, p_ticket_numbers, p_use_points, p_coupon_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.play_gacha_locked(
  p_product_id BIGINT,
  p_count INTEGER,
  p_use_points BOOLEAN DEFAULT FALSE,
  p_coupon_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT pg_try_advisory_xact_lock(hashtext('draw:user:' || v_user_id::text)) THEN
    RAISE EXCEPTION 'DRAW_IN_PROGRESS';
  END IF;

  IF NOT pg_try_advisory_xact_lock(hashtext('draw:product:' || p_product_id::text)) THEN
    RAISE EXCEPTION 'PRODUCT_BUSY';
  END IF;

  RETURN public.play_gacha(p_product_id, p_count, p_use_points, p_coupon_id);
END;
$$;

COMMIT;

