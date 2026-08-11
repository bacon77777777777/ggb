-- 525: get_popular_series 排除機器人帳號與機台獎池商品
--
-- 這支是首頁「推薦」排序與二級頁籤順序的全站熱度來源，但它直接數
-- draw_records，沒有濾 is_bot —— CLAUDE.md 明訂所有統計都要排除機器人。
-- 目前 draw_records 剛好都是真人（重置時清掉了），所以還沒出事；
-- 但機器人帳號還在，只要腳本再往那張表塞資料，熱門系列就會被灌票。
--
-- 一併修兩件小事：
--   1. 判斷「資料夠不夠」的 v_real_count 也要只算真人，不然一堆假抽獎
--      會讓它以為資料足夠，然後回傳一份全是機器人口味的排行
--   2. type='slot'（機台獎池）不是玩家逛得到的商品，不該影響首頁排序

CREATE OR REPLACE FUNCTION public.get_popular_series()
RETURNS TABLE(series text, score numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_real_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_real_count
  FROM draw_records dr
  JOIN users u ON u.id = dr.user_id
  WHERE u.is_bot IS NOT TRUE;

  IF v_real_count >= 20 THEN
    RETURN QUERY
    SELECT
      p.series,
      COUNT(dr.id)::NUMERIC AS score
    FROM draw_records dr
    JOIN products p ON dr.product_id = p.id
    JOIN users u ON u.id = dr.user_id
    WHERE p.series IS NOT NULL AND p.series <> ''
      AND p.type <> 'slot'
      AND u.is_bot IS NOT TRUE
    GROUP BY p.series
    ORDER BY score DESC
    LIMIT 20;
  ELSE
    -- 抽獎資料還不夠：用 is_hot 商品數量 + 總商品數量當作代理熱門度
    RETURN QUERY
    SELECT
      p.series,
      (SUM(CASE WHEN p.is_hot THEN 3 ELSE 1 END))::NUMERIC AS score
    FROM products p
    WHERE p.series IS NOT NULL AND p.series <> ''
      AND p.status = 'active'
      AND p.type <> 'slot'
    GROUP BY p.series
    ORDER BY score DESC
    LIMIT 20;
  END IF;
END;
$function$;

SELECT * FROM get_popular_series();
