-- Migration 299: 修正 get_winning_records 函數
-- 問題：SECURITY INVOKER 導致 anon 角色被 RLS 擋住，跑馬燈顯示空白
-- 解法：改為 SECURITY DEFINER + 混合真實用戶與機器人抽獎記錄

DROP FUNCTION IF EXISTS get_winning_records(INTEGER);

CREATE OR REPLACE FUNCTION get_winning_records(p_limit INT DEFAULT 20)
RETURNS TABLE(
  id          BIGINT,
  user_id     UUID,
  user_name   TEXT,
  product_name TEXT,
  prize_level TEXT,
  prize_name  TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH real_draws AS (
    -- 真實用戶最近的抽獎（最多佔一半名額）
    SELECT
      dr.id,
      dr.user_id,
      COALESCE(u.name, '神秘客')::text AS user_name,
      COALESCE(p.name, '未知商品')::text AS product_name,
      COALESCE(dr.prize_level, '')::text AS prize_level,
      COALESCE(dr.prize_name, '未知獎項')::text AS prize_name
    FROM draw_records dr
    JOIN users u ON u.id = dr.user_id AND (u.is_bot IS NULL OR u.is_bot = false)
    LEFT JOIN products p ON p.id = dr.product_id
    ORDER BY dr.created_at DESC
    LIMIT GREATEST(p_limit / 2, 5)
  ),
  bot_draws AS (
    -- 機器人隨機抽獎（補足名額）
    SELECT
      dr.id,
      dr.user_id,
      COALESCE(u.name, '神秘客')::text AS user_name,
      COALESCE(p.name, '未知商品')::text AS product_name,
      COALESCE(dr.prize_level, '')::text AS prize_level,
      COALESCE(dr.prize_name, '未知獎項')::text AS prize_name
    FROM draw_records dr
    JOIN users u ON u.id = dr.user_id AND u.is_bot = true
    LEFT JOIN products p ON p.id = dr.product_id
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
$$;

-- 授予 anon 和 authenticated 呼叫權限
GRANT EXECUTE ON FUNCTION get_winning_records(INT) TO anon, authenticated;
