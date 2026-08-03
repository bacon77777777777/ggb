-- 414: 首頁中獎跑馬燈排除機台返還
--
-- 機台的普通旋轉返還會寫進 draw_records（prize_level='coin_return'、無 product_id），
-- 而跑馬燈直接撈 draw_records，導致「某某抽到黃金序章」這種返還訊息混進中獎播報。
-- 返還不是中獎，玩家看了會誤以為那是獎品。

CREATE OR REPLACE FUNCTION public.get_winning_records(p_limit integer DEFAULT 20)
 RETURNS TABLE(id bigint, user_id uuid, user_name text, product_name text, prize_level text, prize_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH real_draws AS (
    SELECT
      dr.id,
      dr.user_id,
      COALESCE(u.name, '神秘客')::text AS user_name,
      COALESCE(p.name, '未知商品')::text AS product_name,
      COALESCE(dr.prize_level, '')::text AS prize_level,
      COALESCE(dr.prize_name, pp.name, '未知獎項')::text AS prize_name
    FROM draw_records dr
    JOIN users u ON u.id = dr.user_id AND (u.is_bot IS NULL OR u.is_bot = false)
    LEFT JOIN products p ON p.id = dr.product_id
    LEFT JOIN product_prizes pp ON pp.id = dr.product_prize_id
    WHERE COALESCE(dr.prize_level, '') <> 'coin_return'
    ORDER BY dr.created_at DESC
    LIMIT GREATEST(p_limit / 2, 5)
  ),
  bot_draws AS (
    SELECT
      dr.id,
      dr.user_id,
      COALESCE(u.name, '神秘客')::text AS user_name,
      COALESCE(p.name, '未知商品')::text AS product_name,
      COALESCE(dr.prize_level, '')::text AS prize_level,
      COALESCE(dr.prize_name, pp.name, '未知獎項')::text AS prize_name
    FROM draw_records dr
    JOIN users u ON u.id = dr.user_id AND u.is_bot = true
    LEFT JOIN products p ON p.id = dr.product_id
    LEFT JOIN product_prizes pp ON pp.id = dr.product_prize_id
    WHERE COALESCE(dr.prize_level, '') <> 'coin_return'
    ORDER BY RANDOM()
    LIMIT p_limit
  ),
  combined AS (
    SELECT * FROM real_draws
    UNION ALL
    SELECT * FROM bot_draws
  )
  SELECT *
  FROM combined
  ORDER BY RANDOM()
  LIMIT LEAST(GREATEST(p_limit, 1), 50);
END;
$function$;
