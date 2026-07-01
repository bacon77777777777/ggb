-- 真實數據不足時，跑馬燈與排行榜回傳展示用假數據
-- 閾值：draw_records < 20 筆時啟用假數據補足

-- ── 1. get_winning_records：真實不足 20 筆時回傳假跑馬燈資料 ─────────────────

CREATE OR REPLACE FUNCTION public.get_winning_records(p_limit INTEGER DEFAULT 10)
RETURNS TABLE (
  id BIGINT,
  user_name TEXT,
  product_name TEXT,
  prize_level TEXT,
  prize_name TEXT
)
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
  ELSE
    -- 假數據展示
    RETURN QUERY
    SELECT * FROM (VALUES
      (1001::BIGINT, '小林同學',   '【寶可夢】皮卡丘轉蛋', 'S賞', '皮卡丘特別版'),
      (1002::BIGINT, 'GachaKing',  '【鬼滅之刃】一番賞', 'A賞', '炭治郎 特製公仔'),
      (1003::BIGINT, '轉蛋達人',   '【蛋黃哥】盒玩', 'B賞', '蛋黃哥 慵懶款'),
      (1004::BIGINT, '幸運星星',   '【航海王】一番賞', 'A賞', '魯夫 Gear5 公仔'),
      (1005::BIGINT, 'Lucky777',   '【進擊的巨人】轉蛋', 'S賞', '艾連 最終季 ver.'),
      (1006::BIGINT, '御宅一號',   '【咒術迴戰】一番賞', 'A賞', '五條悟 特別色'),
      (1007::BIGINT, '夜晚的貓',   '【蠟筆小新】盒玩', 'C賞', '小新 動作全明星'),
      (1008::BIGINT, 'MiniMaster', '【寶可夢】皮卡丘轉蛋', 'A賞', '伊布 進化系列'),
      (1009::BIGINT, '轉蛋勇者',   '【鬼滅之刃】一番賞', 'B賞', '禰豆子 換衣Ver.'),
      (1010::BIGINT, '神秘玩家',   '【航海王】一番賞', 'S賞', '索隆 三刀流 限定')
    ) AS t(id, user_name, product_name, prize_level, prize_name)
    LIMIT LEAST(GREATEST(p_limit, 1), 10);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_winning_records(INTEGER) TO anon, authenticated;


-- ── 2. get_leaderboard_whales：真實不足 20 筆時回傳假排行 ────────────────────

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
      (au.raw_user_meta_data->>'avatar_url')::TEXT AS avatar_url,
      SUM(p.price)::NUMERIC AS total_spent,
      RANK() OVER (ORDER BY SUM(p.price) DESC) AS rank
    FROM draw_records d
    JOIN products p ON d.product_id = p.id
    JOIN users u ON d.user_id = u.id
    JOIN auth.users au ON u.id = au.id
    WHERE
      CASE
        WHEN p_range = 'day'   THEN d.created_at >= date_trunc('day', NOW() - INTERVAL '1 day') AND d.created_at < date_trunc('day', NOW())
        WHEN p_range = 'week'  THEN d.created_at >= date_trunc('week', NOW() - INTERVAL '1 week') AND d.created_at < date_trunc('week', NOW())
        WHEN p_range = 'month' THEN d.created_at >= date_trunc('month', NOW())
        ELSE TRUE
      END
    GROUP BY u.id, u.name, au.raw_user_meta_data
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


-- ── 3. get_leaderboard_lucky ─────────────────────────────────────────────────

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
      (au.raw_user_meta_data->>'avatar_url')::TEXT AS avatar_url,
      COUNT(CASE WHEN d.prize_level IN ('A賞','S賞','Last One','LAST ONE','最後賞') THEN 1 END)::BIGINT AS big_prize_count,
      RANK() OVER (ORDER BY COUNT(CASE WHEN d.prize_level IN ('A賞','S賞','Last One','LAST ONE','最後賞') THEN 1 END) DESC) AS rank
    FROM draw_records d
    JOIN users u ON d.user_id = u.id
    JOIN auth.users au ON u.id = au.id
    WHERE
      CASE
        WHEN p_range = 'day'   THEN d.created_at >= date_trunc('day', NOW() - INTERVAL '1 day') AND d.created_at < date_trunc('day', NOW())
        WHEN p_range = 'week'  THEN d.created_at >= date_trunc('week', NOW() - INTERVAL '1 week') AND d.created_at < date_trunc('week', NOW())
        WHEN p_range = 'month' THEN d.created_at >= date_trunc('month', NOW())
        ELSE TRUE
      END
    GROUP BY u.id, u.name, au.raw_user_meta_data
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


-- ── 4. get_leaderboard_unlucky ───────────────────────────────────────────────

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
      (au.raw_user_meta_data->>'avatar_url')::TEXT AS avatar_url,
      COUNT(d.id)::BIGINT AS draw_count,
      RANK() OVER (ORDER BY COUNT(d.id) DESC) AS rank
    FROM draw_records d
    JOIN users u ON d.user_id = u.id
    JOIN auth.users au ON u.id = au.id
    WHERE
      CASE
        WHEN p_range = 'day'   THEN d.created_at >= date_trunc('day', NOW() - INTERVAL '1 day') AND d.created_at < date_trunc('day', NOW())
        WHEN p_range = 'week'  THEN d.created_at >= date_trunc('week', NOW() - INTERVAL '1 week') AND d.created_at < date_trunc('week', NOW())
        WHEN p_range = 'month' THEN d.created_at >= date_trunc('month', NOW())
        ELSE TRUE
      END
    GROUP BY u.id, u.name, au.raw_user_meta_data
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
