-- 526: get_popular_series 加時間衰減（老闆指定）
--
-- 原本數的是 draw_records 的「全部」筆數，沒有任何時間權重，結果是
-- 先跑的永遠贏：間諜家家酒 85 分、吉伊卡哇 76 分，就算下個月完全
-- 沒人抽也還是掛第一，新系列要追過去得抽滿 86 次。平台開越久牆越高。
--
-- 改成跟 get_user_series_preferences 同一套衰減，兩支演算法口徑一致：
--   7 天內 ×1.0｜30 天內 ×0.5｜更早 ×0.2
--
-- 這樣熱門榜反映的是「最近在紅什麼」，而不是「歷史上誰先開賣」。

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
      SUM(
        CASE
          WHEN dr.created_at > NOW() - INTERVAL '7 days'  THEN 1.0
          WHEN dr.created_at > NOW() - INTERVAL '30 days' THEN 0.5
          ELSE 0.2
        END
      )::NUMERIC AS score
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
