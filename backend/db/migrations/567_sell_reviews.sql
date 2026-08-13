-- 567_sell_reviews.sql
--
-- 交易評價（好評率）。
--
-- 原型的「我的」頁四格是：成交率／平均出貨／好評率／保證金鎖定。
-- 前三個裡只有「好評率」站上完全沒有資料來源 —— 商城從頭到尾沒有評價機制。
-- 與其在前台塞一個假數字或改成別的欄位，不如把這個介面補起來。
--
-- 設計取捨：
--   · 二元好評／負評，不做五星。玩家給星會集中在 5 顆，分不出好壞；
--     二元的「好評率 %」直接可讀，也跟原型的顯示格式一致
--   · 只有買家能評，且只能評已完成（step=5）的訂單 —— 沒收到貨的評價沒有意義
--   · 一筆訂單只能評一次，可以改（改變心意是常態，但不能灌票）

BEGIN;

CREATE TABLE IF NOT EXISTS public.sell_reviews (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id   bigint NOT NULL REFERENCES public.sell_orders(id) ON DELETE CASCADE,
  seller_id  uuid   NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  buyer_id   uuid   NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  is_good    boolean NOT NULL,
  comment    text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

-- 一筆訂單一則評價
CREATE UNIQUE INDEX IF NOT EXISTS sell_reviews_order_uniq ON public.sell_reviews(order_id);
CREATE INDEX IF NOT EXISTS sell_reviews_seller_idx ON public.sell_reviews(seller_id);

ALTER TABLE public.sell_reviews ENABLE ROW LEVEL SECURITY;

-- 評價是公開的（買家要看得到別人怎麼說），寫入才限本人
DROP POLICY IF EXISTS "Sell reviews - public read" ON public.sell_reviews;
CREATE POLICY "Sell reviews - public read" ON public.sell_reviews FOR SELECT USING (true);

-- ============================================================
-- 統計 view 加好評率
-- ============================================================

CREATE OR REPLACE VIEW public.sell_seller_stats AS
SELECT
  u.id AS seller_id,
  COUNT(*) FILTER (WHERE o.step = 5 AND o.cancelled = false)                       AS done_count,
  COUNT(*) FILTER (WHERE o.cancelled = true AND o.cancel_reason = 'ship_timeout')  AS failed_count,
  CASE
    WHEN COUNT(*) FILTER (WHERE (o.step = 5 AND o.cancelled = false)
                             OR (o.cancelled = true AND o.cancel_reason = 'ship_timeout')) = 0 THEN 100
    ELSE ROUND(
      COUNT(*) FILTER (WHERE o.step = 5 AND o.cancelled = false)::numeric * 100
      / COUNT(*) FILTER (WHERE (o.step = 5 AND o.cancelled = false)
                            OR (o.cancelled = true AND o.cancel_reason = 'ship_timeout')), 1)
  END AS success_rate,
  COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (o.shipped_at - o.seller_confirmed_at)) / 60)
           FILTER (WHERE o.shipped_at IS NOT NULL AND o.seller_confirmed_at IS NOT NULL))::int, 0) AS avg_ship_minutes,
  -- 好評率：沒有任何評價時給 100，新賣家不該一開始就頂著難看的數字
  COALESCE((
    SELECT CASE WHEN COUNT(*) = 0 THEN 100
                ELSE ROUND(COUNT(*) FILTER (WHERE r.is_good)::numeric * 100 / COUNT(*), 1) END
    FROM public.sell_reviews r WHERE r.seller_id = u.id
  ), 100) AS good_rate
FROM public.users u
LEFT JOIN public.sell_orders o ON o.seller_id = u.id
GROUP BY u.id;

-- ============================================================
-- 送出評價
-- ============================================================

CREATE OR REPLACE FUNCTION public.sell_order_review(
  p_order_id bigint, p_is_good boolean, p_comment text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_uid uuid;
  o     RECORD;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '請先登入');
  END IF;

  SELECT * INTO o FROM public.sell_orders WHERE id = p_order_id;
  IF o IS NULL OR o.buyer_id <> v_uid THEN
    RETURN jsonb_build_object('success', false, 'message', '找不到這筆訂單');
  END IF;
  IF o.step <> 5 OR o.cancelled THEN
    RETURN jsonb_build_object('success', false, 'message', '交易完成後才能評價');
  END IF;

  INSERT INTO public.sell_reviews (order_id, seller_id, buyer_id, is_good, comment)
  VALUES (p_order_id, o.seller_id, v_uid, p_is_good, NULLIF(btrim(p_comment), ''))
  ON CONFLICT (order_id) DO UPDATE
    SET is_good = EXCLUDED.is_good, comment = EXCLUDED.comment, updated_at = NOW();

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ============================================================
-- 我的賣場儀表補好評率
-- ============================================================

CREATE OR REPLACE FUNCTION public.sell_my_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid  uuid;
  v_tier jsonb;
  v_stat RECORD;
  v_lock int;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '請先登入');
  END IF;

  v_tier := public.sell_seller_tier(v_uid);
  SELECT done_count, failed_count, success_rate, avg_ship_minutes, good_rate INTO v_stat
  FROM public.sell_seller_stats WHERE seller_id = v_uid;

  SELECT COALESCE(SUM(amount), 0) INTO v_lock
  FROM public.sell_deposits WHERE seller_id = v_uid AND status = 'locked';

  RETURN jsonb_build_object(
    'success', true,
    'tier', v_tier,
    'done_count', COALESCE(v_stat.done_count, 0),
    'failed_count', COALESCE(v_stat.failed_count, 0),
    'success_rate', COALESCE(v_stat.success_rate, 100),
    'avg_ship_minutes', COALESCE(v_stat.avg_ship_minutes, 0),
    'good_rate', COALESCE(v_stat.good_rate, 100),
    'locked_deposit', v_lock,
    'is_pro', public.sell_is_pro(v_uid),
    'tokens', (SELECT tokens FROM public.users WHERE id = v_uid)
  );
END;
$$;

COMMIT;
