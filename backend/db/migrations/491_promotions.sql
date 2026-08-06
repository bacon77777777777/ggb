-- 491：促銷方案
--
-- 老闆要的第一個方案是「買五送一」。在轉蛋平台上「買」就是「抽」，
-- 所以那句話的意思是：抽 6 次，只收 5 次的錢。
--
-- ── 為什麼做成「折價」而不是「多送一抽」 ──
-- 兩種寫法的結果一樣，但改動範圍差很多：
--   多送一抽 → play_gacha 裡每一處用 p_count 當「數量」的地方都要改成
--              「付費數 vs 實抽數」兩個變數，核心抽獎邏輯整段要動
--   折價     → 只多一行「扣掉促銷金額」，數量、庫存、籤號全部不變
-- 而且折價正好對上老闆要的帳務呈現：列滿 6 抽的錢，再減一項活動促銷。
--
-- ── 為什麼促銷不跟優惠券疊加 ──
-- 老闆指定的。實作上採「促銷優先，優惠券不吃也不扣」——
-- 若改成兩個都算，玩家的券會被默默消耗掉卻只換到一份折扣。

CREATE TABLE IF NOT EXISTS public.promotions (
  id          bigserial PRIMARY KEY,
  name        text        NOT NULL,
  -- 目前只有 bundle。之後要加 percent_off / bulk_discount 時改這個 CHECK
  type        text        NOT NULL DEFAULT 'bundle' CHECK (type IN ('bundle')),
  -- bundle: {"buy": 5, "free": 1}
  config      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- 商品卡角落顯示的字。留白就用方案內容自動組（例：買5送1）
  badge_text  text,
  scope       text        NOT NULL CHECK (scope IN ('product', 'category', 'all')),
  starts_at   timestamptz,
  ends_at     timestamptz,
  is_active   boolean     NOT NULL DEFAULT true,
  -- 同一個商品同時符合多個方案時，取 priority 最大的那個。相同時取新的
  priority    integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.promotions IS
  '促銷方案。scope=category 時掛在分類上，之後往那個分類丟商品會自動繼承，不必逐一設定。';

CREATE TABLE IF NOT EXISTS public.promotion_targets (
  id           bigserial PRIMARY KEY,
  promotion_id bigint NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
  product_id   bigint REFERENCES public.products(id)   ON DELETE CASCADE,
  category_id  uuid   REFERENCES public.categories(id) ON DELETE CASCADE,
  -- 一列只能綁一個對象。兩個都填或都不填都是設定錯誤，不要留給查詢時才發現
  CONSTRAINT promotion_targets_one_of CHECK (num_nonnulls(product_id, category_id) = 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS promotion_targets_product_uniq
  ON public.promotion_targets (promotion_id, product_id) WHERE product_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS promotion_targets_category_uniq
  ON public.promotion_targets (promotion_id, category_id) WHERE category_id IS NOT NULL;

ALTER TABLE public.promotions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_targets ENABLE ROW LEVEL SECURITY;

-- 前台要知道哪個商品有促銷才掛得出標籤。只開讀，寫入一律走後台的 service role
DROP POLICY IF EXISTS promotions_public_read ON public.promotions;
CREATE POLICY promotions_public_read ON public.promotions FOR SELECT USING (true);
DROP POLICY IF EXISTS promotion_targets_public_read ON public.promotion_targets;
CREATE POLICY promotion_targets_public_read ON public.promotion_targets FOR SELECT USING (true);

GRANT SELECT ON public.promotions, public.promotion_targets TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 這個商品現在適用哪個方案
--
-- 三種來源：直接綁這個商品、綁了它所屬的分類、或全站方案。
-- 同時命中多個時取 priority 最大的；一樣大就取比較新的那個。
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_product_promotion(p_product_id bigint)
RETURNS TABLE (id bigint, name text, type text, config jsonb, badge_text text)
LANGUAGE sql
STABLE
AS $$
  SELECT p.id, p.name, p.type, p.config, p.badge_text
  FROM public.promotions p
  WHERE p.is_active
    AND (p.starts_at IS NULL OR p.starts_at <= now())
    AND (p.ends_at   IS NULL OR p.ends_at   >  now())
    AND (
      p.scope = 'all'
      OR EXISTS (
        SELECT 1 FROM public.promotion_targets t
        WHERE t.promotion_id = p.id AND t.product_id = p_product_id
      )
      OR EXISTS (
        SELECT 1 FROM public.promotion_targets t
        JOIN public.product_categories pc ON pc.category_id = t.category_id
        WHERE t.promotion_id = p.id AND pc.product_id = p_product_id
      )
    )
  ORDER BY p.priority DESC, p.id DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_product_promotion(bigint) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 這一單可以折多少
--
-- bundle 的算法：每滿 (buy + free) 抽就送 free 抽。
--   買5送1、抽 6 → floor(6/6)=1 組 → 折 1 抽
--   買5送1、抽 7 → 一樣只折 1 抽（還沒湊滿第二組）
--   買5送1、抽 12 → 折 2 抽
--   買5送1、抽 5 → 折 0 抽（差 1 抽才湊得滿，前台會提示）
--
-- 回 0 代表沒有促銷或還沒湊滿，呼叫端照原價走就好。
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.promo_discount_for(
  p_product_id bigint,
  p_count      integer,
  p_unit_price integer
)
RETURNS integer
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_promo RECORD;
  v_buy   integer;
  v_free  integer;
  v_sets  integer;
BEGIN
  IF p_count IS NULL OR p_count < 1 OR COALESCE(p_unit_price, 0) <= 0 THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_promo FROM public.get_product_promotion(p_product_id);
  IF NOT FOUND THEN RETURN 0; END IF;

  IF v_promo.type = 'bundle' THEN
    v_buy  := GREATEST(1, COALESCE((v_promo.config ->> 'buy')::int, 0));
    v_free := GREATEST(0, COALESCE((v_promo.config ->> 'free')::int, 0));
    IF v_free = 0 THEN RETURN 0; END IF;

    v_sets := p_count / (v_buy + v_free);
    RETURN v_sets * v_free * p_unit_price;
  END IF;

  RETURN 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.promo_discount_for(bigint, integer, integer) TO anon, authenticated;
