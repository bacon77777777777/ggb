BEGIN;

CREATE OR REPLACE FUNCTION public.get_winning_records(p_limit INTEGER DEFAULT 10)
RETURNS TABLE (
  id BIGINT,
  user_name TEXT,
  product_name TEXT,
  prize_level TEXT,
  prize_name TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    dr.id,
    COALESCE(u.name, '神秘客') AS user_name,
    COALESCE(p.name, '未知商品') AS product_name,
    COALESCE(dr.prize_level, '') AS prize_level,
    COALESCE(dr.prize_name, '未知獎項') AS prize_name
  FROM draw_records dr
  LEFT JOIN users u ON u.id = dr.user_id
  LEFT JOIN products p ON p.id = dr.product_id
  ORDER BY dr.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 50);
$$;

GRANT EXECUTE ON FUNCTION public.get_winning_records(INTEGER) TO anon, authenticated;

COMMIT;
