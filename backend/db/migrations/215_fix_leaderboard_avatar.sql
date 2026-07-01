-- 排行榜 RPC 改從 public.users.avatar_url 讀取頭像
-- 原本錯誤讀取 auth.users.raw_user_meta_data->>'avatar_url'

CREATE OR REPLACE FUNCTION get_leaderboard_whales(p_range TEXT DEFAULT 'week')
RETURNS TABLE (
  user_id UUID,
  nickname TEXT,
  avatar_url TEXT,
  total_spent NUMERIC,
  rank BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_real_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_real_count FROM draw_records;

  IF v_real_count >= 20 THEN
    RETURN QUERY
    SELECT
      u.id,
      COALESCE(u.name, '神秘玩家') AS nickname,
      u.avatar_url,
      SUM(p.price)::NUMERIC AS total_spent,
      RANK() OVER (ORDER BY SUM(p.price) DESC) AS rank
    FROM draw_records d
    JOIN products p ON d.product_id = p.id
    JOIN users u ON d.user_id = u.id
    WHERE
      CASE
        WHEN p_range = 'day'   THEN d.created_at >= date_trunc('day', NOW() - INTERVAL '1 day') AND d.created_at < date_trunc('day', NOW())
        WHEN p_range = 'week'  THEN d.created_at >= date_trunc('week', NOW() - INTERVAL '1 week') AND d.created_at < date_trunc('week', NOW())
        WHEN p_range = 'month' THEN d.created_at >= date_trunc('month', NOW())
        ELSE TRUE
      END
    GROUP BY u.id, u.name, u.avatar_url
    ORDER BY total_spent DESC
    LIMIT 10;
  ELSE
    RETURN QUERY
    SELECT * FROM (VALUES
      ('00000000-0000-0000-0000-000000000001'::UUID, 'GachaKing',  NULL::TEXT, 28500::NUMERIC, 1::BIGINT),
      ('00000000-0000-0000-0000-000000000002'::UUID, '轉蛋達人',   NULL::TEXT, 21300::NUMERIC, 2::BIGINT),
      ('00000000-0000-0000-0000-000000000003'::UUID, '幸運星星',   NULL::TEXT, 18750::NUMERIC, 3::BIGINT),
      ('00000000-0000-0000-0000-000000000004'::UUID, 'Lucky777',   NULL::TEXT, 15200::NUMERIC, 4::BIGINT),
      ('00000000-0000-0000-0000-000000000005'::UUID, '御宅一號',   NULL::TEXT, 12800::NUMERIC, 5::BIGINT),
      ('00000000-0000-0000-0000-000000000006'::UUID, '夜晚的貓',   NULL::TEXT,  9600::NUMERIC, 6::BIGINT),
      ('00000000-0000-0000-0000-000000000007'::UUID, 'MiniMaster', NULL::TEXT,  7400::NUMERIC, 7::BIGINT),
      ('00000000-0000-0000-0000-000000000008'::UUID, '轉蛋勇者',   NULL::TEXT,  5500::NUMERIC, 8::BIGINT),
      ('00000000-0000-0000-0000-000000000009'::UUID, '小林同學',   NULL::TEXT,  3900::NUMERIC, 9::BIGINT),
      ('00000000-0000-0000-0000-000000000010'::UUID, '神秘玩家',   NULL::TEXT,  2100::NUMERIC, 10::BIGINT)
    ) AS t(user_id, nickname, avatar_url, total_spent, rank);
  END IF;
END;
$$;


CREATE OR REPLACE FUNCTION get_leaderboard_lucky(p_range TEXT DEFAULT 'week')
RETURNS TABLE (
  user_id UUID,
  nickname TEXT,
  avatar_url TEXT,
  big_prize_count BIGINT,
  rank BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_real_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_real_count FROM draw_records;

  IF v_real_count >= 20 THEN
    RETURN QUERY
    SELECT
      u.id,
      COALESCE(u.name, '神秘玩家') AS nickname,
      u.avatar_url,
      COUNT(CASE WHEN d.prize_level IN ('A賞','S賞','Last One','LAST ONE','最後賞') THEN 1 END)::BIGINT AS big_prize_count,
      RANK() OVER (ORDER BY COUNT(CASE WHEN d.prize_level IN ('A賞','S賞','Last One','LAST ONE','最後賞') THEN 1 END) DESC) AS rank
    FROM draw_records d
    JOIN users u ON d.user_id = u.id
    WHERE
      CASE
        WHEN p_range = 'day'   THEN d.created_at >= date_trunc('day', NOW() - INTERVAL '1 day') AND d.created_at < date_trunc('day', NOW())
        WHEN p_range = 'week'  THEN d.created_at >= date_trunc('week', NOW() - INTERVAL '1 week') AND d.created_at < date_trunc('week', NOW())
        WHEN p_range = 'month' THEN d.created_at >= date_trunc('month', NOW())
        ELSE TRUE
      END
    GROUP BY u.id, u.name, u.avatar_url
    ORDER BY big_prize_count DESC
    LIMIT 10;
  ELSE
    RETURN QUERY
    SELECT * FROM (VALUES
      ('00000000-0000-0000-0000-000000000003'::UUID, '幸運星星',   NULL::TEXT, 12::BIGINT, 1::BIGINT),
      ('00000000-0000-0000-0000-000000000001'::UUID, 'GachaKing',  NULL::TEXT,  9::BIGINT, 2::BIGINT),
      ('00000000-0000-0000-0000-000000000006'::UUID, '夜晚的貓',   NULL::TEXT,  7::BIGINT, 3::BIGINT),
      ('00000000-0000-0000-0000-000000000009'::UUID, '小林同學',   NULL::TEXT,  6::BIGINT, 4::BIGINT),
      ('00000000-0000-0000-0000-000000000004'::UUID, 'Lucky777',   NULL::TEXT,  5::BIGINT, 5::BIGINT),
      ('00000000-0000-0000-0000-000000000007'::UUID, 'MiniMaster', NULL::TEXT,  4::BIGINT, 6::BIGINT),
      ('00000000-0000-0000-0000-000000000002'::UUID, '轉蛋達人',   NULL::TEXT,  3::BIGINT, 7::BIGINT),
      ('00000000-0000-0000-0000-000000000005'::UUID, '御宅一號',   NULL::TEXT,  3::BIGINT, 8::BIGINT),
      ('00000000-0000-0000-0000-000000000008'::UUID, '轉蛋勇者',   NULL::TEXT,  2::BIGINT, 9::BIGINT),
      ('00000000-0000-0000-0000-000000000010'::UUID, '神秘玩家',   NULL::TEXT,  1::BIGINT, 10::BIGINT)
    ) AS t(user_id, nickname, avatar_url, big_prize_count, rank);
  END IF;
END;
$$;


CREATE OR REPLACE FUNCTION get_leaderboard_unlucky(p_range TEXT DEFAULT 'month')
RETURNS TABLE (
  user_id UUID,
  nickname TEXT,
  avatar_url TEXT,
  draw_count BIGINT,
  rank BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_real_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_real_count FROM draw_records;

  IF v_real_count >= 20 THEN
    RETURN QUERY
    SELECT
      u.id,
      COALESCE(u.name, '神秘玩家') AS nickname,
      u.avatar_url,
      COUNT(d.id)::BIGINT AS draw_count,
      RANK() OVER (ORDER BY COUNT(d.id) DESC) AS rank
    FROM draw_records d
    JOIN users u ON d.user_id = u.id
    WHERE
      CASE
        WHEN p_range = 'day'   THEN d.created_at >= date_trunc('day', NOW() - INTERVAL '1 day') AND d.created_at < date_trunc('day', NOW())
        WHEN p_range = 'week'  THEN d.created_at >= date_trunc('week', NOW() - INTERVAL '1 week') AND d.created_at < date_trunc('week', NOW())
        WHEN p_range = 'month' THEN d.created_at >= date_trunc('month', NOW())
        ELSE TRUE
      END
    GROUP BY u.id, u.name, u.avatar_url
    ORDER BY draw_count DESC
    LIMIT 10;
  ELSE
    RETURN QUERY
    SELECT * FROM (VALUES
      ('00000000-0000-0000-0000-000000000001'::UUID, 'GachaKing',  NULL::TEXT, 95::BIGINT, 1::BIGINT),
      ('00000000-0000-0000-0000-000000000002'::UUID, '轉蛋達人',   NULL::TEXT, 72::BIGINT, 2::BIGINT),
      ('00000000-0000-0000-0000-000000000005'::UUID, '御宅一號',   NULL::TEXT, 58::BIGINT, 3::BIGINT),
      ('00000000-0000-0000-0000-000000000004'::UUID, 'Lucky777',   NULL::TEXT, 43::BIGINT, 4::BIGINT),
      ('00000000-0000-0000-0000-000000000008'::UUID, '轉蛋勇者',   NULL::TEXT, 37::BIGINT, 5::BIGINT),
      ('00000000-0000-0000-0000-000000000003'::UUID, '幸運星星',   NULL::TEXT, 31::BIGINT, 6::BIGINT),
      ('00000000-0000-0000-0000-000000000010'::UUID, '神秘玩家',   NULL::TEXT, 24::BIGINT, 7::BIGINT),
      ('00000000-0000-0000-0000-000000000007'::UUID, 'MiniMaster', NULL::TEXT, 19::BIGINT, 8::BIGINT),
      ('00000000-0000-0000-0000-000000000009'::UUID, '小林同學',   NULL::TEXT, 14::BIGINT, 9::BIGINT),
      ('00000000-0000-0000-0000-000000000006'::UUID, '夜晚的貓',   NULL::TEXT,  8::BIGINT, 10::BIGINT)
    ) AS t(user_id, nickname, avatar_url, draw_count, rank);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION get_leaderboard_whales(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_leaderboard_lucky(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_leaderboard_unlucky(TEXT) TO authenticated;
