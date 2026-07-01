-- 全平台熱門系列：新用戶無抽轉紀錄時使用
-- draw_records < 20 筆 → 回傳 is_hot 商品較多的系列排序
-- draw_records >= 20 筆 → 回傳真實抽轉次數排序

CREATE OR REPLACE FUNCTION public.get_popular_series()
RETURNS TABLE (series TEXT, score NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_real_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_real_count FROM draw_records;

  IF v_real_count >= 20 THEN
    RETURN QUERY
    SELECT
      p.series,
      COUNT(dr.id)::NUMERIC AS score
    FROM draw_records dr
    JOIN products p ON dr.product_id = p.id
    WHERE p.series IS NOT NULL AND p.series <> ''
    GROUP BY p.series
    ORDER BY score DESC
    LIMIT 20;
  ELSE
    -- 用 is_hot 商品數量 + 總商品數量當作代理熱門度
    RETURN QUERY
    SELECT
      p.series,
      (SUM(CASE WHEN p.is_hot THEN 3 ELSE 1 END))::NUMERIC AS score
    FROM products p
    WHERE p.series IS NOT NULL AND p.series <> ''
      AND p.status = 'active'
    GROUP BY p.series
    ORDER BY score DESC
    LIMIT 20;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_popular_series() TO anon, authenticated;
