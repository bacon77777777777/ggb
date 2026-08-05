-- 461: 跑馬燈只播大獎（籤號類玩法）
--
-- 老闆的規則：
--   轉蛋、盒玩          → 不限制，所有品項都能上榜
--   一番賞、抽卡、自製賞、機台 → 只播「總量 < 10」的品項
--
-- ── 為什麼是 total 不是 remaining ──
-- 「庫存」直覺上是剩餘量，但用 remaining 這條規則會隨時間自己壞掉：
-- 一檔 500 張的一番賞賣到尾聲時，連 E 賞都會剩不到 10 個，
-- 然後開始被當成大獎廣播。用 total 則不管賣到哪都是同一批品項。
-- 實測 STG：一番賞「剩餘 < 10」有 17 個、「總量 < 10」只有 14 個，
-- 多出來的 3 個正是賣到快完的普獎。
--
-- ── 為什麼轉蛋、盒玩不套這條 ──
-- 它們是機率制，每個品項動輒幾十上百個。實測 STG 的 33 檔轉蛋、182 個品項，
-- 沒有一個總量小於 10 —— 套下去等於把佔全站三分之二的轉蛋整個踢出跑馬燈。
--
-- ── 為什麼不加佔比規則 ──
-- 評估過「總量 < 10 或 佔該檔 ≤ 1%／5%」，在真實資料上只多出 1 個品項。
-- 多一條規則就多一件要記的事，換來的差異接近零。
-- 真的遇到超大檔期（5000 張以上、大獎總量 15~20）再加也只是一行。

CREATE OR REPLACE FUNCTION public.get_winning_records(p_limit integer DEFAULT 20)
RETURNS TABLE(id bigint, user_id uuid, user_name text, product_name text,
              prize_level text, prize_name text)
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
      -- 抽籤販售的落選不是「中獎」，不該出現在中獎跑馬燈上
      AND COALESCE(dr.prize_level, '') <> '未中獎'
      AND dr.status NOT IN ('lost', 'expired')
      -- 籤號類玩法只播大獎；轉蛋、盒玩不限制
      AND (
        p.type IN ('gacha', 'blindbox')
        OR COALESCE(pp.total, 0) < 10
      )
    ORDER BY dr.created_at DESC
    LIMIT GREATEST(p_limit / 2, 5)
  ),
  bot_draws AS (
    -- 機器人：即時組合，不碰 draw_records
    SELECT
      -- 負數 id：一眼看得出不是真的 draw_records 列，也不會與真實紀錄的 key 相撞
      (-row_number() OVER ())::bigint AS id,
      b.bot_id AS user_id,
      COALESCE(b.bot_name, '神秘客')::text AS user_name,
      pk.product_name,
      pk.prize_level,
      pk.prize_name
    FROM (
      -- 一律加表別名：函數的 OUT 參數也叫 id，不限定會 ambiguous
      SELECT bu.id AS bot_id, bu.name AS bot_name
      FROM users bu WHERE bu.is_bot = TRUE ORDER BY RANDOM() LIMIT p_limit
    ) b
    CROSS JOIN LATERAL (
      -- 分兩步：先均勻選商品，再在該商品內加權選品項。
      -- 一步到位（對全站品項一起加權）會讓「剛好有 total=1 品項」的那檔商品
      -- 洗掉整個跑馬燈 —— 實測 47 檔商品裡有一檔佔了 7/10。
      SELECT
        mp.name::text                       AS product_name,
        COALESCE(mpp.level, '')::text       AS prize_level,
        COALESCE(mpp.name, '未知獎項')::text AS prize_name
      FROM (
        SELECT p2.id, p2.name, p2.type FROM products p2
        WHERE p2.is_active AND p2.status = 'active'
          AND EXISTS (
            SELECT 1 FROM product_prizes x
            WHERE x.product_id = p2.id AND x.total > 0 AND x.level <> '未中獎'
              AND (p2.type IN ('gacha', 'blindbox') OR x.total < 10)
          )
        ORDER BY RANDOM() LIMIT 1
      ) mp
      CROSS JOIN LATERAL (
        SELECT pp.level, pp.name
        FROM product_prizes pp
        WHERE pp.product_id = mp.id
          AND pp.total > 0
          AND pp.level <> '未中獎'
          -- 籤號類玩法只播大獎；轉蛋、盒玩不限制
          AND (mp.type IN ('gacha', 'blindbox') OR pp.total < 10)
        -- 乘上 total 讓稀有品項更容易被選中；
        -- 不加權的話跑馬燈會被數量最多的普獎洗版，看起來沒人中大獎
        ORDER BY RANDOM() * pp.total
        LIMIT 1
      ) mpp
    ) pk
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

COMMENT ON FUNCTION public.get_winning_records IS
  '中獎跑馬燈。真實玩家讀 draw_records；機器人即時從上架商品組合，不寫入任何營運資料表。籤號類玩法只播總量 < 10 的品項。';
