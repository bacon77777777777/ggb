-- 460: 中獎跑馬燈的機器人改為純展示，不再讀 draw_records
--
-- 站上已經有兩套「機器人展示資料獨立於營運資料」的機制：
--   排行榜   → leaderboard_bot_daily_stats
--   機台彈幕 → slot_danmaku_bots（註解直接寫「獨立表，不進報表、不扣庫存」）
-- 只有跑馬燈還在讀 draw_records，是唯一沒跟上的。
--
-- 而 draw_records 同時是三件事的依據：
--   庫存扣減、銷量統計（sync_product_sales）、公平性驗證的逐籤比對。
-- 為了讓跑馬燈有東西而往裡面塞假抽獎，代價是：
--   * 假抽獎佔走的籤號，真玩家永遠抽不到，獎品卡在機器人倉庫不會出貨
--   * products.sales 沒有濾 is_bot，後台銷量直接灌水
--   * 隨機籤號配隨機品項對不上封存表，玩家在驗證頁會看到「與表不符」——
--     那正是我們要給玩家用來抓平台作弊的訊號
--   * migration 451/454 之後 (product_id, ticket_number) 有唯一索引，
--     隨機籤號一定撞號，整批寫入會直接失敗
--
-- ── 改法 ──
-- 機器人那半段改成「即時從目前上架的商品隨機組合」，不存任何資料。
-- 好處是不需要種資料也不需要維護：商品一上架跑馬燈就有內容，
-- 商品下架就自動消失，永遠不會顯示到已經不存在的品項。
--
-- 順帶修掉真實玩家那半段的一個漏洞：抽籤販售的落選紀錄（status = 'lost'）
-- 原本會被當成中獎播出去 —— 玩家沒中還被跑馬燈公告「中獎」，很奇怪。

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
    -- 真實玩家：照舊讀 draw_records
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
      -- 抽籤販售的落選不是「中獎」，不該出現在中獎跑馬燈上。
      -- 這條原本沒有 —— 抽籤販售上線後，真實玩家的落選紀錄就會被播出去
      AND COALESCE(dr.prize_level, '') <> '未中獎'
      AND dr.status NOT IN ('lost', 'expired')
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
        SELECT p2.id, p2.name FROM products p2
        WHERE p2.is_active AND p2.status = 'active'
          AND EXISTS (
            SELECT 1 FROM product_prizes x
            WHERE x.product_id = p2.id AND x.total > 0 AND x.level <> '未中獎'
          )
        ORDER BY RANDOM() LIMIT 1
      ) mp
      CROSS JOIN LATERAL (
        SELECT pp.level, pp.name
        FROM product_prizes pp
        WHERE pp.product_id = mp.id
          AND pp.total > 0
          -- 抽籤販售的落選籤不該出現在跑馬燈上：那不是「中獎」
          AND pp.level <> '未中獎'
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
  '中獎跑馬燈。真實玩家讀 draw_records；機器人即時從上架商品組合展示用資料，不寫入任何營運資料表。';
