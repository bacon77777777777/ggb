-- 661_viewer_context.sql
--
-- 「N 人正在看」的底數改成吃真實資料（老闆 2026-08-31）
--
-- ## 原本為什麼假
--
-- 底數是每件商品各自憑空給的 4~14，於是**每一件商品都有十幾人在看**。
-- 真實流量從來不是這樣：PROD 近 24 小時的分佈是 81 / 21 / 20 / 10 / 6 …
-- 然後一大片 0，極度傾斜。而且後台 header 同時寫著「在線人數 0」，
-- 商品頁卻說 10 人正在看 —— 兩個數字自己打架。
--
-- ## 改成什麼
--
-- 底數 = 這件商品近 24 小時抽數的**佔比** × 站上熱度預算 × 時段係數
--
--   近 24 小時沒人抽的商品 → 佔比 0 → 底數 0 → 只顯示真人數（通常就是 1，你自己）
--   熱門商品             → 佔比高 → 分到最多
--
-- 用「近 24 小時抽數」而不是「已抽比例」：後者是生涯數字，
-- 一個半年前完抽的商品比例 100%，但現在根本沒人看它。
--
-- 三個數字一次回，前台一支查詢就夠 —— 商品頁本來就已經有好幾支查詢在跑。

BEGIN;

CREATE OR REPLACE FUNCTION public.get_viewer_context(p_product_id bigint)
RETURNS TABLE (
  product_draws_24h integer,
  total_draws_24h   integer,
  online_now        integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    /* 這件商品近 24 小時的真人抽數 */
    (SELECT count(*)::integer
       FROM draw_records d
       JOIN users u ON u.id = d.user_id AND (u.is_bot IS NULL OR u.is_bot = false)
      WHERE d.product_id = p_product_id
        AND d.created_at > now() - interval '24 hours'),
    /* 全站近 24 小時的真人抽數（分母） */
    (SELECT count(*)::integer
       FROM draw_records d
       JOIN users u ON u.id = d.user_id AND (u.is_bot IS NULL OR u.is_bot = false)
      WHERE d.created_at > now() - interval '24 hours'),
    /*
     * 站上真實在線人數：近 15 分鐘有足跡的真人。
     * 跟後台 header 的「在線人數」同一個定義與同一份資料，
     * 兩邊不一致的話玩家看不到、但我們自己會先被搞混。
     */
    (SELECT count(*)::integer
       FROM visit_logs v
       JOIN users u ON u.id = v.user_id AND (u.is_bot IS NULL OR u.is_bot = false)
      WHERE v.created_at > now() - interval '15 minutes');
$$;

COMMENT ON FUNCTION public.get_viewer_context(bigint) IS
  '「N 人正在看」膠囊的底數輸入：這件商品近 24h 抽數、全站近 24h 抽數、站上近 15 分鐘在線真人數';

GRANT EXECUTE ON FUNCTION public.get_viewer_context(bigint) TO anon, authenticated, service_role;

COMMIT;
