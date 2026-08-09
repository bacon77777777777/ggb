-- 515: 轉蛋機率單位修正 —— 十連全出同一品項的根因
--
-- 事故：PROD 玩家兩次十連抽全部出「小新」。
-- 根因：XLSX 匯入的商品把機率存成小數（0.2 = 20%），但 play_gacha 的輪盤
-- 假設機率是百分比（cumulative += probability / 100），小數商品的累積機率
-- 只有 0.01，隨機值 99% 落不進去 → 全部走 fallback「機率最高的第一個」
-- → 永遠同一品項。PROD 33 檔轉蛋/盒玩有 31 檔中招（STG 是編輯器建的、全為百分比）。
--
-- 修法：
--   1. 資料：機率總和 ≈ 1 的商品（明顯是小數單位）全部 ×100 轉回百分比
--   2. play_gacha 輪盤改「單位無關」：用當下可抽品項的機率總和當分母做正規化，
--      單位錯、機率沒填滿 100、品項抽完導致總和下降，都不再會鎖死在同一品項；
--      機率全為 0 時退回以剩餘庫存加權（比 fallback 固定取第一個公平）
--   3. 匯入端（程式碼另修）：commit 時轉蛋/盒玩機率自動正規化為百分比
--
-- 註：庫存扣減其實一直正常（該檔 200→180、小新 40→20），老闆看到 400/400
-- 是同名不同檔的「貼臉公仔」；此檔只修機率選獎。

-- ── 1. 資料正規化：小數 → 百分比 ─────────────────────────────────────────────

UPDATE public.product_prizes pp
SET probability = pp.probability * 100
FROM (
  SELECT p.id
  FROM public.products p
  JOIN public.product_prizes x ON x.product_id = p.id
  WHERE p.type IN ('gacha', 'blindbox')
  GROUP BY p.id
  HAVING SUM(x.probability) BETWEEN 0.5 AND 2
) bad
WHERE pp.product_id = bad.id;

-- ── 2. play_gacha：輪盤正規化（其餘邏輯與 512 版完全相同） ───────────────────

CREATE OR REPLACE FUNCTION public.play_gacha(p_product_id bigint, p_count integer DEFAULT 1, p_use_points boolean DEFAULT false, p_coupon_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
 DECLARE
   v_user_id           UUID;
   v_product           RECORD;
   v_product_price     INTEGER;
   v_total_cost        INTEGER;
   v_total_cost_points INTEGER;
   v_discount_amount   INTEGER := 0;
   v_coupon_record     RECORD;
   v_user_points       INTEGER;
   v_user_tokens       INTEGER;
   v_prize             RECORD;
   v_last_one_prize    RECORD;
   v_prizes_drawn      JSONB := '[]'::jsonb;
   v_random            NUMERIC;
   v_random_int        NUMERIC;
   v_cumulative        NUMERIC;
   v_selected_prize    RECORD;
   v_draw_record_id    BIGINT;
   i                   INTEGER;
   v_promo_discount    INTEGER := 0;
   v_promo_id          BIGINT;
   v_remaining_charge  INTEGER := 0;
   v_row_spent         INTEGER;
   v_weight_total      NUMERIC;
   v_use_prob          BOOLEAN;
   v_weight            NUMERIC;
 BEGIN
   v_user_id := auth.uid();
   IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

   -- 次數下限/上限防護：擋負數印幣與異常大量
   IF p_count IS NULL OR p_count < 1 THEN RAISE EXCEPTION 'Invalid draw count'; END IF;
   IF p_count > 1000 THEN RAISE EXCEPTION 'Draw count too large'; END IF;

   SELECT * INTO v_product FROM public.products WHERE id = p_product_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
   IF v_product.status <> 'active' THEN RAISE EXCEPTION 'Product is not available'; END IF;

   -- 類型防護：此通道僅限轉蛋/盒玩（機率抽）；
   -- 一番賞/抽卡/自製賞走賞等票號引擎，老虎機獎池（price=0）絕不可由此抽
   IF COALESCE(v_product.type, '') NOT IN ('gacha', 'blindbox') THEN
     RAISE EXCEPTION 'Wrong product type for this draw';
   END IF;
   IF v_product.remaining < p_count THEN RAISE EXCEPTION 'Not enough tickets remaining'; END IF;

   v_product_price := v_product.price;
   v_total_cost    := v_product_price * p_count;

   -- 促銷（migration 491／494／511）。買五送一之類的方案在這裡折價 ——
   -- 不改抽獎數量，玩家照抽照扣庫存，只是金額少收。
   v_promo_discount := public.promo_discount_for(p_product_id, p_count, v_product_price);
   IF v_promo_discount > 0 THEN
     SELECT id INTO v_promo_id FROM public.get_product_promotion(p_product_id);
     v_promo_discount := LEAST(v_promo_discount, v_total_cost);
     v_total_cost := v_total_cost - v_promo_discount;
   END IF;

   IF p_coupon_id IS NOT NULL AND NOT p_use_points AND v_promo_discount = 0 THEN
     SELECT uc.*, c.discount_type, c.discount_value, c.min_spend
     INTO v_coupon_record
     FROM public.user_coupons uc
     JOIN public.coupons c ON c.id = uc.coupon_id
     WHERE uc.id = p_coupon_id
       AND uc.user_id = v_user_id
       AND uc.status = 'unused'
       AND c.is_active = TRUE
       AND (uc.expiry_date IS NULL OR uc.expiry_date > NOW());
     IF FOUND AND v_total_cost >= v_coupon_record.min_spend THEN
       IF v_coupon_record.discount_type = 'percentage' THEN
         v_discount_amount := FLOOR(v_total_cost * (v_coupon_record.discount_value / 100.0));
       ELSE
         v_discount_amount := v_coupon_record.discount_value;
       END IF;
       v_discount_amount := LEAST(v_discount_amount, v_total_cost);
     END IF;
   END IF;

   v_total_cost := v_total_cost - v_discount_amount;

   IF p_use_points THEN
     v_total_cost_points := (v_product_price * p_count) * 4;  -- 4 積分 = 1 G幣
     UPDATE public.users
     SET points = points - v_total_cost_points
     WHERE id = v_user_id AND points >= v_total_cost_points
     RETURNING points INTO v_user_points;
     IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient points balance'; END IF;
   ELSE
     UPDATE public.users
     SET tokens = tokens - v_total_cost
     WHERE id = v_user_id AND tokens >= v_total_cost
     RETURNING tokens INTO v_user_tokens;
     IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient token balance'; END IF;
     IF p_coupon_id IS NOT NULL AND v_discount_amount > 0 THEN
       UPDATE public.user_coupons SET status = 'used', used_at = NOW() WHERE id = p_coupon_id;
     END IF;
   END IF;

   -- 記下這次用掉的促銷。廠商結算要看得出「賣了幾抽、平台折了多少」，
   -- 折扣由誰吸收是設定問題（platform_settings.promo_cost_bearer），
   -- 先把事實記下來，帳怎麼算之後改不會失真
   IF v_promo_discount > 0 THEN
     INSERT INTO public.promotion_redemptions
       (promotion_id, product_id, user_id, draw_count, discount)
     VALUES (v_promo_id, p_product_id, v_user_id, p_count, v_promo_discount);
   END IF;

   -- 每筆實收：逐筆收滿單價、錢收完為止（買5送1 = 4筆150 + 1筆0）。
   -- 加總必等於實際扣款，抽獎紀錄／消費紀錄／token_ledger 都以此為準
   v_remaining_charge := CASE WHEN p_use_points THEN 0 ELSE v_total_cost END;

   FOR i IN 1..p_count LOOP
     SELECT * INTO v_last_one_prize
     FROM public.product_prizes
     WHERE product_id = p_product_id
       AND level IN ('Last One', 'LAST ONE', 'last one')
       AND remaining = 1
     LIMIT 1;

     IF FOUND AND v_product.remaining = 1 THEN
       v_selected_prize := v_last_one_prize;
     ELSE
       SELECT (random() * 18446744073709551615)::NUMERIC INTO v_random_int;
       v_random := v_random_int / 18446744073709551615.0;

       -- 輪盤分母＝當下可抽品項的機率總和（單位無關）。
       -- 舊版寫死 probability/100，機率存小數（XLSX 匯入）或品項抽完導致
       -- 總和 < 100 時，隨機值落在缺口 → 全走 fallback 固定出第一個品項。
       -- 機率全為 0 時退回以剩餘庫存加權。
       SELECT COALESCE(SUM(probability), 0) INTO v_weight_total
       FROM public.product_prizes
       WHERE product_id = p_product_id AND remaining > 0
         AND level NOT IN ('Last One', 'LAST ONE', 'last one');

       v_use_prob := v_weight_total > 0;
       IF NOT v_use_prob THEN
         SELECT COALESCE(SUM(remaining), 0) INTO v_weight_total
         FROM public.product_prizes
         WHERE product_id = p_product_id AND remaining > 0
           AND level NOT IN ('Last One', 'LAST ONE', 'last one');
       END IF;

       v_cumulative := 0;
       v_selected_prize := NULL;
       FOR v_prize IN
         SELECT * FROM public.product_prizes
         WHERE product_id = p_product_id AND remaining > 0
           AND level NOT IN ('Last One', 'LAST ONE', 'last one')
         ORDER BY probability DESC, id ASC
       LOOP
         v_weight := CASE WHEN v_use_prob THEN v_prize.probability ELSE v_prize.remaining END;
         v_cumulative := v_cumulative + v_weight;
         IF v_cumulative > v_random * v_weight_total THEN
           v_selected_prize := v_prize;
           EXIT;
         END IF;
       END LOOP;
       IF v_selected_prize IS NULL THEN
         SELECT * INTO v_selected_prize
         FROM public.product_prizes
         WHERE product_id = p_product_id AND remaining > 0
           AND level NOT IN ('Last One', 'LAST ONE', 'last one')
         ORDER BY probability DESC LIMIT 1;
       END IF;
     END IF;

     IF v_selected_prize IS NULL THEN RAISE EXCEPTION 'No prizes available'; END IF;

     v_row_spent        := LEAST(v_product_price, v_remaining_charge);
     v_remaining_charge := v_remaining_charge - v_row_spent;

     UPDATE public.product_prizes SET remaining = remaining - 1 WHERE id = v_selected_prize.id;
     UPDATE public.products SET remaining = remaining - 1 WHERE id = p_product_id;

     INSERT INTO public.draw_records (user_id, product_id, product_prize_id, status, ticket_number, points_used, tokens_spent)
     VALUES (v_user_id, p_product_id, v_selected_prize.id, 'in_warehouse', v_product.remaining - (i - 1),
             CASE WHEN p_use_points THEN v_product_price ELSE 0 END, v_row_spent)
     RETURNING id INTO v_draw_record_id;

     NULL; -- total_draws 改由 track_mission_event 單一維護（migration 465）

     v_prizes_drawn := v_prizes_drawn || jsonb_build_object(
       'prize_id',    v_selected_prize.id,
       'level',       v_selected_prize.level,
       'name',        v_selected_prize.name,
       'image_url',   v_selected_prize.image_url,
       'record_id',   v_draw_record_id
     );
   END LOOP;

   RETURN jsonb_build_object(
     'success',         true,
     'prizes',          v_prizes_drawn,
     'new_balance',     CASE WHEN p_use_points THEN v_user_points ELSE v_user_tokens END,
     'discount_amount', v_discount_amount
   );
 END;
 $function$;
