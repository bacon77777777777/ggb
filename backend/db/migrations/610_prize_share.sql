-- 610: 曬獎圖片的資料來源與「大獎」判定（老闆 2026-08-24）
--
-- 只有大獎能曬圖。判定放在 DB 而不是前台：前台改了就能亂曬，而且規則只該有一份。
--
-- 判定順序（`is_major_prize`）：
--   1. `products.major_prizes` 有設定 → 只認裡面列的賞等（後台覆寫用的逃生門，目前全站都沒設）
--   2. 賞等制（ichiban／custom／card，賞等是 A賞～N賞）→ **A賞 與 最後賞**
--   3. 機率制（gacha／blindbox，賞等一律「一般版」）→ 機率 ≤ 5%，
--      或「該商品最低機率且不到平均機率的一半」
--      ⚠️ 目前站上轉蛋／盒玩的機率都在 10~34%、分布平均，所以這類**不會**有大獎 ——
--      這是誠實的結果（那些池子確實沒有突出的稀有品），不是判定壞掉。
--      日後上了真正的稀有品項（1~2%）就會自動被認出來。
--
-- `get_prize_share_data(p_draw_id)`：一趟取回曬圖需要的全部資料 ——
-- 品項名／圖、商品名、中獎時間，以及玩家在**這件商品**上的抽獎次數與總花費
-- （曬圖上的「總共抽了 N 抽／花費 M 代幣」）。只看自己的紀錄（auth.uid() 比對），
-- 別人的 draw_id 一律回 NULL。

CREATE OR REPLACE FUNCTION public.is_major_prize(p_prize_id bigint)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
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

  -- 2. 賞等制
  IF COALESCE(v_product.type, '') IN ('ichiban', 'custom', 'card') THEN
    RETURN COALESCE(v_prize.is_last_one, false) OR v_prize.level IN ('A賞', '最後賞');
  END IF;

  -- 3. 機率制
  IF COALESCE(v_prize.probability, 0) <= 0 THEN RETURN false; END IF;
  IF v_prize.probability <= 5 THEN RETURN true; END IF;
  SELECT MIN(probability), AVG(probability) INTO v_min, v_avg
  FROM public.product_prizes WHERE product_id = v_prize.product_id AND probability > 0;
  RETURN v_prize.probability = v_min AND v_prize.probability < v_avg / 2;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_prize_share_data(p_draw_id bigint)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_rec    RECORD;
  v_draws  integer;
  v_spent  integer;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;

  SELECT d.id, d.created_at, d.product_id, d.product_prize_id, d.prize_name, d.prize_level,
         d.prize_image_url,
         pp.name AS prize_name2, pp.image_url, pp.id AS pp_id,
         p.name AS product_name, p.type AS product_type,
         u.name AS player_name
    INTO v_rec
  FROM public.draw_records d
  JOIN public.products p ON p.id = d.product_id
  LEFT JOIN public.product_prizes pp ON pp.id = d.product_prize_id
  LEFT JOIN public.users u ON u.id = d.user_id
  WHERE d.id = p_draw_id AND d.user_id = v_uid;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- 玩家在這件商品上的抽數與花費（曬圖上的兩個數字）
  SELECT COUNT(*), COALESCE(SUM(GREATEST(COALESCE(d.tokens_spent, 0), 0)), 0)
    INTO v_draws, v_spent
  FROM public.draw_records d
  WHERE d.user_id = v_uid AND d.product_id = v_rec.product_id;

  RETURN jsonb_build_object(
    'draw_id',      v_rec.id,
    'is_major',     public.is_major_prize(v_rec.pp_id),
    'prize_name',   COALESCE(v_rec.prize_name2, v_rec.prize_name, ''),
    'prize_level',  COALESCE(v_rec.prize_level, ''),
    'prize_image',  COALESCE(v_rec.image_url, v_rec.prize_image_url),
    'product_name', v_rec.product_name,
    'product_type', v_rec.product_type,
    'player_name',  COALESCE(v_rec.player_name, ''),
    'won_at',       v_rec.created_at,
    'draw_count',   v_draws,
    'total_spent',  v_spent
  );
END;
$$;
