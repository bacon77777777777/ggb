-- 527: 新增 get_popular_products()（商品層熱度）
--
-- 目前整套排序演算法只有「系列」層級的熱度（get_popular_series 與
-- get_user_series_preferences 都是照 series 分組）。同一個 IP 底下哪一檔
-- 真的在賣，系統完全不知道 —— 蠟筆小新那 4 檔之間只能比上架時間。
--
-- 這支補上那一層，做法完全比照 get_popular_series：
--   ・7 天內 ×1.0｜30 天內 ×0.5｜更早 ×0.2
--   ・排除機器人帳號（is_bot）與機台獎池商品（type='slot'）
--   ・查詢當下算，不用 cron、不用新欄位、不會過期
--
-- 刻意不用 products.sales：那是歷史累計、沒有衰減，而且 sync_product_sales
-- 沒有濾 is_bot，跟系列熱度不同口徑。
--
-- 同時把 is_hot 從排序責任裡解放出來 —— 它從此純粹是後台手動的「精選」
-- 標籤（前台那顆紅膠囊），不再參與任何排序。

CREATE OR REPLACE FUNCTION public.get_popular_products(p_limit integer DEFAULT 100)
RETURNS TABLE(product_id bigint, score numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    p.id AS product_id,
    SUM(
      CASE
        WHEN dr.created_at > NOW() - INTERVAL '7 days'  THEN 1.0
        WHEN dr.created_at > NOW() - INTERVAL '30 days' THEN 0.5
        ELSE 0.2
      END
    )::NUMERIC AS score
  FROM draw_records dr
  JOIN products p ON p.id = dr.product_id
  JOIN users u ON u.id = dr.user_id
  WHERE p.type <> 'slot'
    AND u.is_bot IS NOT TRUE
  GROUP BY p.id
  ORDER BY score DESC
  LIMIT p_limit;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_popular_products(integer) TO anon, authenticated;

SELECT gp.product_id, p.name, gp.score
FROM get_popular_products(10) gp JOIN products p ON p.id = gp.product_id
ORDER BY gp.score DESC;
