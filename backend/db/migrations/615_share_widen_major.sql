-- 615: 曬圖的大獎判定放寬成跟「交易所上架」同一套（老闆 2026-08-25）
--
-- 背景：站上原本有兩套大獎規則
--   is_major_grade(賞等)  → 白名單 SP／S／A／B／C 賞＋最後賞。交易所上架用這套
--   is_major_prize(品項)  → 一番賞／自製賞／抽卡只認 A賞＋最後賞。曬圖用這套
-- 前台兩顆按鈕卻共用寬鬆的那套，於是 C賞 的「曬圖」按鈕會出現、按下去才被 DB 拒絕。
-- 全站倉庫 2,781 件裡，98 件符合上架規則但只有 23 件符合曬圖規則 —— 有 75 件會踩到。
--
-- 老闆決定放寬（B賞、C賞 也能曬），順便讓兩套規則合而為一：賞等制那條直接呼叫
-- is_major_grade，以後只要改那一支，上架與曬圖會同時跟上。
--
-- ⚠️ **轉蛋／盒玩維持機率制**，不要改成「全部都能曬」：那兩類倉庫裡 1,193 件全是
-- 「一般版」、機率 10~34%，沒有大獎可言。底圖上寫著「超級大獎」，拿去曬一支
-- 1/8 機率的一般版會稀釋掉這張圖的意義。要開放給一般賞請另做一版底圖與文案。
--
-- is_major_prize 只有 get_prize_share_data 一個呼叫端（seal_product_tickets 用的是
-- 另一支 is_major_prize_level），所以這次改動只影響曬圖。

CREATE OR REPLACE FUNCTION public.is_major_prize(p_prize_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_prize   RECORD;
  v_product RECORD;
  v_min     numeric;
  v_avg     numeric;
BEGIN
  SELECT pp.level, pp.probability, pp.is_last_one, pp.product_id
    INTO v_prize
  FROM public.product_prizes pp WHERE pp.id = p_prize_id;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT p.type, p.major_prizes INTO v_product
  FROM public.products p WHERE p.id = v_prize.product_id;
  IF NOT FOUND THEN RETURN false; END IF;

  -- 1. 後台覆寫
  IF v_product.major_prizes IS NOT NULL AND array_length(v_product.major_prizes, 1) > 0 THEN
    RETURN v_prize.level = ANY(v_product.major_prizes);
  END IF;

  -- 2. 賞等制：跟交易所上架同一套白名單（SP／S／A／B／C 賞＋最後賞）
  IF COALESCE(v_product.type, '') IN ('ichiban', 'custom', 'card') THEN
    RETURN COALESCE(v_prize.is_last_one, false) OR public.is_major_grade(v_prize.level);
  END IF;

  -- 3. 機率制（轉蛋／盒玩）
  IF COALESCE(v_prize.probability, 0) <= 0 THEN RETURN false; END IF;
  IF v_prize.probability <= 5 THEN RETURN true; END IF;
  SELECT MIN(probability), AVG(probability) INTO v_min, v_avg
  FROM public.product_prizes WHERE product_id = v_prize.product_id AND probability > 0;
  RETURN v_prize.probability = v_min AND v_prize.probability < v_avg / 2;
END;
$function$;
