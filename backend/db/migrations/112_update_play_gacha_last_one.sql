-- Update play_gacha to handle Last One prize logic correctly
-- 1. Exclude Last One from normal prize pool
-- 2. Award Last One prize when all items are sold out

CREATE OR REPLACE FUNCTION public.play_gacha(p_product_id BIGINT, p_count INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_product_total_count INTEGER;
  v_ticket_numbers INTEGER[];
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_count IS NULL OR p_count <= 0 THEN
    RAISE EXCEPTION 'Invalid draw count';
  END IF;

  SELECT total_count
  INTO v_product_total_count
  FROM products
  WHERE id = p_product_id;

  IF v_product_total_count IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  SELECT ARRAY(
    SELECT t.num
    FROM generate_series(1, v_product_total_count) AS t(num)
    WHERE NOT EXISTS (
      SELECT 1
      FROM draw_records
      WHERE product_id = p_product_id
        AND ticket_number = t.num
    )
    ORDER BY random()
    LIMIT p_count
  )
  INTO v_ticket_numbers;

  IF v_ticket_numbers IS NULL OR array_length(v_ticket_numbers, 1) < p_count THEN
    RAISE EXCEPTION 'Not enough stock remaining';
  END IF;

  RETURN public.play_ichiban(p_product_id, v_ticket_numbers);
END;
$$;
