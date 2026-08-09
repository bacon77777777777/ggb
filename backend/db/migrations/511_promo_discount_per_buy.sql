-- 511: 買五送一的語意修正 —— 「買 5 個、算 4 個的錢」
--
-- 494 的公式是每湊滿 (buy+free)=6 抽才折 1 抽，玩家要抽 6 次才有折扣。
-- 老闆定義：買五送一 = 玩家選 5 抽、其中 1 抽免費（付 4 抽的錢）。
-- 公式改為每滿 buy 抽折 free 抽：floor(count / buy) * free * 單價。
--   5 抽 → 折 1 抽（付 600）；10 抽 → 折 2 抽；6~9 抽 → 折 1 抽。
--
-- 前端 lib/promotions.ts 的顯示公式同步修改 —— 兩邊必須同一條，
-- 畫面顯示多少 DB 就收多少。

CREATE OR REPLACE FUNCTION public.promo_discount_for(p_product_id bigint, p_count integer, p_unit_price integer)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
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

    -- 每滿 buy 抽折 free 抽（買5送1：5 抽付 4 抽的錢）
    v_sets := p_count / v_buy;
    RETURN v_sets * v_free * p_unit_price;
  END IF;

  RETURN 0;
END;
$function$;
