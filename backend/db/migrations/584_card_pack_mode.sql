-- 584_card_pack_mode.sql
--
-- 抽卡「整包模式」：建立抽卡商品時可以指定一抽開幾張（真實卡包 = 一包十張）。
--
-- 現況：card 商品走一番賞的籤引擎，計價是 `單價 × 票數` —— 想要「一包十張」
-- 只能叫玩家按十次抽，價格也變成十倍，跟真實卡包的體驗對不起來。
--
-- 做法：
--   products.cards_per_pack          一抽開幾張。NULL 或 1 = 單張模式（現行，行為不變）
--   play_ichiban(..., p_paid_count)  新增選填參數＝要收幾份錢；不傳就等於票數
--   play_ichiban_auto                整包模式改成「配一整包」而不是隨機湊十個籤位
--
-- 為什麼包要是固定的籤位區間，而不是抽的當下隨機湊十張（老闆 2026-08-18 指正）：
--   玩家買的是「一包」，不是散裝籤位。臨時湊出來的十張是「十張散卡綁一起」，
--   不是卡包。固定成 第 k 包 = 籤位 (k-1)*每包+1 … k*每包 之後，「第 37 包裝了
--   哪十張」在開賣前就隨封存表定案，玩家拿包號就能逐張對表驗證。
--
-- 公平性驗證不受影響：獎項只跟籤位有關，跟誰先抽、一次抽幾張、怎麼分包都無關。
-- 每張卡仍是一張籤，txid_hash 仍是封存承諾，逐籤可驗。
--
-- 促銷贈籤：老闆指示只留給轉蛋與盒玩（走 play_gacha），本支整段停用。
--
-- ⚠ 這支改到計價，先只上 STG，實測過再補 PROD。

BEGIN;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cards_per_pack integer;

COMMENT ON COLUMN public.products.cards_per_pack IS
  '抽卡整包模式：一抽開幾張。NULL 或 1 = 單張模式。第 k 包固定為籤位 (k-1)*n+1 … k*n';

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_cards_per_pack_check;
ALTER TABLE public.products ADD CONSTRAINT products_cards_per_pack_check
  CHECK (cards_per_pack IS NULL OR (cards_per_pack BETWEEN 1 AND 100));

-- 舊的四參數版本要先移除，否則四參數呼叫會在「舊的四參數」與
-- 「新的五參數但第五個有預設值」之間變成 ambiguous
DROP FUNCTION IF EXISTS public.play_ichiban(bigint, integer[], boolean, uuid);

CREATE OR REPLACE FUNCTION public.play_ichiban(p_product_id bigint, p_ticket_numbers integer[], p_use_points boolean DEFAULT false, p_coupon_id uuid DEFAULT NULL::uuid, p_paid_count integer DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_user_id              UUID;
  v_user_tokens          INTEGER;
  v_user_points          INTEGER;
  v_product_price        INTEGER;
  v_product_remaining    INTEGER;
  v_total_count          INTEGER;
  v_seed                 TEXT;
  v_profit_rate          NUMERIC;
  v_major_prizes         TEXT[];
  v_product_status       TEXT;
  v_product_type         TEXT;
  v_draw_key             TEXT;
  v_prize                RECORD;
  v_last_one_prize       RECORD;
  v_prizes_drawn         JSONB := '[]'::jsonb;
  v_ticket_no            INTEGER;
  v_nonce                INTEGER;
  v_hmac                 BYTEA;
  v_hex                  TEXT;
  v_random               NUMERIC;
  v_random_int           NUMERIC;
  v_hash                 TEXT;
  v_total_cost           INTEGER;
  v_total_cost_points    INTEGER;
  v_draw_count           INTEGER;
  v_paid_count           INTEGER;
  v_coupon_record        RECORD;
  v_discount_amount      INTEGER := 0;
  v_promo_bonus          INTEGER := 0;
  v_bonus_tickets        INTEGER[];
  v_promo_id             BIGINT;
  v_prob_total           NUMERIC;
  v_major_total          NUMERIC;
  v_minor_total          NUMERIC;
  v_major_adjusted_total NUMERIC;
  v_minor_adjusted_total NUMERIC;
  v_minor_factor         NUMERIC;
  v_i                    INTEGER;
  v_seal_len             INTEGER;
  v_commitment           TEXT;
  v_remaining_charge     INTEGER := 0;
  v_row_spent            INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_ticket_numbers IS NULL OR array_length(p_ticket_numbers, 1) IS NULL OR array_length(p_ticket_numbers, 1) = 0 THEN
    RAISE EXCEPTION 'No tickets selected';
  END IF;

  v_draw_count := array_length(p_ticket_numbers, 1);
  -- 整包模式（products.cards_per_pack）：一包一個價，抽 N 張只收 1 包的錢。
  -- 不傳 p_paid_count 就等於票數 —— 單張模式與所有既有呼叫端行為完全不變。
  v_paid_count := GREATEST(1, COALESCE(p_paid_count, v_draw_count));

  SELECT price, remaining, total_count, seed,
         COALESCE(profit_rate, 1.0), major_prizes, status, type
  INTO   v_product_price, v_product_remaining, v_total_count,
         v_seed, v_profit_rate, v_major_prizes, v_product_status, v_product_type
  FROM   products
  WHERE  id = p_product_id;

  IF v_product_price IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  IF v_product_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Product not active';
  END IF;

  -- 類型防護：一番賞通道只能抽一番賞商品
  IF v_product_type NOT IN ('ichiban', 'card', 'custom') THEN
    RAISE EXCEPTION 'Wrong product type for this draw';
  END IF;

  IF COALESCE(v_product_remaining, 0) < v_draw_count THEN
    RAISE EXCEPTION 'Not enough stock remaining';
  END IF;

  -- 確認每個票號都未曾抽過
  IF EXISTS (
    SELECT 1 FROM draw_records
    WHERE product_id = p_product_id
      AND ticket_number = ANY(p_ticket_numbers)
  ) THEN
    RAISE EXCEPTION 'TICKET_ALREADY_DRAWN';
  END IF;

  -- 票號必須在合法範圍
  IF EXISTS (
    SELECT 1 FROM unnest(p_ticket_numbers) t(n)
    WHERE n < 1 OR n > v_total_count
  ) THEN
    RAISE EXCEPTION 'Invalid ticket number';
  END IF;

  -- 封存資訊查一次就好，整個迴圈都是同一檔商品（贈籤取號也要用它界定範圍）
  SELECT array_length(s.assignment, 1), s.commitment
  INTO   v_seal_len, v_commitment
  FROM   product_ticket_seals s WHERE s.product_id = p_product_id;

  -- 促銷（migration 517）：買5送1 = 付 5 抽的錢、多送 1 抽。
  -- 贈籤從尚未抽出的籤號隨機補（同 play_ichiban_auto 的配票法）；
  -- 有封存表時只從封存範圍內取。籤不夠送就少送。積分支付不吃促銷。
  -- 停用（老闆 2026-08-18）：促銷贈籤只用在轉蛋與盒玩，那兩種走 play_gacha。
  -- 這支服務一番賞／抽卡／自製賞 —— 這些是封存排籤的商品，多送一張籤會
  -- 動到「付幾份錢、開幾個籤位」的對應，整包模式下更難解釋。
  -- 保留變數與下游邏輯（v_promo_bonus 恆為 0），要開回來只需還原這個條件。
  IF FALSE THEN
    v_promo_bonus := public.promo_bonus_for(p_product_id, v_paid_count);
    IF v_promo_bonus > 0 THEN
      SELECT array_agg(n) INTO v_bonus_tickets FROM (
        SELECT n FROM generate_series(1, LEAST(COALESCE(v_seal_len, v_total_count), v_total_count)) n
        WHERE NOT EXISTS (
          SELECT 1 FROM draw_records
          WHERE product_id = p_product_id AND ticket_number = n
        )
        AND n <> ALL(p_ticket_numbers)
        ORDER BY random()
        LIMIT v_promo_bonus
      ) s;

      IF v_bonus_tickets IS NOT NULL AND array_length(v_bonus_tickets, 1) > 0 THEN
        v_promo_bonus := array_length(v_bonus_tickets, 1);
        p_ticket_numbers := p_ticket_numbers || v_bonus_tickets;
        v_draw_count := array_length(p_ticket_numbers, 1);
        SELECT id INTO v_promo_id FROM public.get_product_promotion(p_product_id);
      ELSE
        v_promo_bonus := 0;
      END IF;
    END IF;
  END IF;

  IF COALESCE(v_product_remaining, 0) < v_draw_count THEN
    -- 庫存跟不上贈籤（理論上取不到籤就不會進來，留一道保險）
    RAISE EXCEPTION 'Not enough stock remaining';
  END IF;

  IF v_seed IS NULL THEN
    v_seed := md5(random()::text || clock_timestamp()::text);
    UPDATE products SET seed = v_seed WHERE id = p_product_id;
  END IF;

  -- 實際決定獎項的金鑰＝公開 seed + 私密 secret（secret 完抽後才公開）
  v_draw_key := public.ensure_draw_secret(p_product_id);

  IF v_major_prizes IS NULL OR array_length(v_major_prizes, 1) IS NULL THEN
    v_major_prizes := ARRAY['A賞'];
  END IF;

  IF v_profit_rate IS NULL OR v_profit_rate <= 0 THEN
    v_profit_rate := 1.0;
  END IF;

  -- 收全額：只收付費抽數的錢，贈籤不收
  v_total_cost := v_product_price * v_paid_count;

  -- 優惠券（不與促銷併用）
  IF p_coupon_id IS NOT NULL AND NOT p_use_points AND v_promo_bonus = 0 THEN
    SELECT uc.*, c.discount_type, c.discount_value, c.min_spend
    INTO   v_coupon_record
    FROM   user_coupons uc
    JOIN   coupons c ON uc.coupon_id = c.id
    WHERE  uc.id = p_coupon_id
      AND  uc.user_id = v_user_id
      AND  uc.status = 'unused'
      AND  c.is_active = TRUE
      AND  (uc.expiry_date IS NULL OR uc.expiry_date > now());

    IF v_coupon_record IS NULL THEN
      RAISE EXCEPTION 'Invalid or expired coupon';
    END IF;

    IF v_total_cost < v_coupon_record.min_spend THEN
      RAISE EXCEPTION 'Minimum spend not met for this coupon';
    END IF;

    IF v_coupon_record.discount_type = 'fixed' THEN
      v_discount_amount := v_coupon_record.discount_value;
    ELSIF v_coupon_record.discount_type = 'percentage' THEN
      v_discount_amount := floor(v_total_cost * (v_coupon_record.discount_value / 100.0));
    END IF;

    v_discount_amount := LEAST(v_discount_amount, v_total_cost);

    UPDATE user_coupons SET status = 'used', used_at = now()
    WHERE id = p_coupon_id;
  END IF;

  v_total_cost := v_total_cost - v_discount_amount;

  -- 扣款
  IF p_use_points THEN
    v_total_cost_points := (v_product_price * v_paid_count) * 4;
    UPDATE users SET points = points - v_total_cost_points
    WHERE id = v_user_id AND points >= v_total_cost_points
    RETURNING points INTO v_user_points;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Insufficient points balance';
    END IF;
  ELSE
    UPDATE users SET tokens = tokens - v_total_cost
    WHERE id = v_user_id AND tokens >= v_total_cost
    RETURNING tokens INTO v_user_tokens;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Insufficient token balance';
    END IF;
  END IF;

  -- 記下這次促銷送了幾抽。廠商結算要看得出「賣了幾抽、送了幾抽」，
  -- 成本由誰吸收是設定問題（platform_settings.promo_cost_bearer），
  -- 先把事實記下來，帳怎麼算之後改不會失真
  IF v_promo_bonus > 0 THEN
    INSERT INTO public.promotion_redemptions
      (promotion_id, product_id, user_id, draw_count, discount, bonus_count)
    VALUES (v_promo_id, p_product_id, v_user_id, v_paid_count, v_promo_bonus * v_product_price, v_promo_bonus);
  END IF;

  -- 每筆實收：逐筆收滿單價、錢收完為止（買5送1 = 5筆單價 + 1筆0，贈籤排最後）。
  -- 加總必等於實際扣款，抽獎紀錄／消費紀錄／token_ledger 都以此為準
  v_remaining_charge := CASE WHEN p_use_points THEN 0 ELSE v_total_cost END;

  -- 依票號逐一決定獎項
  FOR v_i IN 1..v_draw_count LOOP
    v_ticket_no := p_ticket_numbers[v_i];

    v_nonce := v_ticket_no;

    -- 有封存表 → 直接查表。獎項在開賣前就排定，抽獎當下不做任何機率運算，
    -- 這是「玩家可驗證」的前提：結果只跟籤號有關，跟誰先抽、抽了幾張都無關。
    IF v_seal_len IS NOT NULL THEN
      -- 封存過的商品，超出範圍的籤一律擋掉。
      -- 原本這裡是「查不到就走舊路徑」，結果 total_count 只要比封存籤數大一張
      -- （設了最後賞就會這樣），那張籤會安靜地用舊演算法出獎，不報錯也驗不了。
      IF v_ticket_no < 1 OR v_ticket_no > v_seal_len THEN
        RAISE EXCEPTION 'INVALID_TICKET: 籤號 % 不在封存範圍 1~% 內', v_ticket_no, v_seal_len;
      END IF;

      SELECT pp.id, pp.level, pp.name, pp.image_url
      INTO   v_prize
      FROM   product_ticket_seals s
      JOIN   product_prizes pp ON pp.id = s.assignment[v_ticket_no]
      WHERE  s.product_id = p_product_id;

      -- 憑證改記封存承諾：玩家拿它比對商品頁公布的值即可
      v_hash   := v_commitment;
      v_random := 0;

    ELSE
      -- 舊路徑：只給封存機制上線前就已開賣、無法回頭封存的商品用。
      -- 這些商品賣完就不會再有新的（新商品上架時一律自動封存），
      -- 不要為了「統一」把它刪掉，刪了在飛的檔期會直接壞掉。
      v_hmac       := hmac(convert_to(v_nonce::text, 'utf8'), convert_to(v_draw_key, 'utf8'), 'sha256'::text);
      v_hex        := encode(v_hmac, 'hex');
      v_random_int := hex_to_decimal(substring(v_hex, 1, 16));
      v_random     := v_random_int / 18446744073709551615.0;
      v_hash       := encode(digest(convert_to(v_seed || ':' || v_nonce::text, 'utf8'), 'sha256'::text), 'hex');


      SELECT COALESCE(SUM(CASE WHEN level NOT IN ('Last One', 'LAST ONE', '最後賞') THEN probability END), 0)
      INTO   v_prob_total
      FROM   product_prizes
      WHERE  product_id = p_product_id AND remaining > 0;

      IF v_prob_total <= 0 THEN
        WITH prize_weights AS (
          SELECT pp.id, pp.level, pp.name, pp.image_url,
                 CASE
                   WHEN pp.level = ANY(v_major_prizes) AND pp.level NOT IN ('Last One', 'LAST ONE', '最後賞')
                     THEN (pp.remaining::numeric) * v_profit_rate
                   WHEN pp.level IN ('Last One', 'LAST ONE', '最後賞')
                     THEN 0
                   ELSE (pp.remaining::numeric)
                 END AS adjusted_weight
          FROM   product_prizes pp
          WHERE  pp.product_id = p_product_id AND pp.remaining > 0
            AND  pp.level NOT IN ('Last One', 'LAST ONE', '最後賞')
        ),
        prize_cdf AS (
          SELECT *, SUM(adjusted_weight) OVER (ORDER BY level ASC, id ASC) AS cum_weight,
                    SUM(adjusted_weight) OVER () AS total_weight
          FROM prize_weights
        )
        SELECT * INTO v_prize FROM prize_cdf
        WHERE cum_weight >= (v_random * total_weight)
        ORDER BY cum_weight ASC LIMIT 1;
      ELSE
        SELECT COALESCE(SUM(CASE WHEN level = ANY(v_major_prizes) AND level NOT IN ('Last One', 'LAST ONE', '最後賞') THEN probability END), 0),
               COALESCE(SUM(CASE WHEN NOT (level = ANY(v_major_prizes)) AND level NOT IN ('Last One', 'LAST ONE', '最後賞') THEN probability END), 0)
        INTO   v_major_total, v_minor_total
        FROM   product_prizes
        WHERE  product_id = p_product_id AND remaining > 0;

        v_major_adjusted_total := v_major_total * v_profit_rate;
        v_minor_adjusted_total := GREATEST(0, 100 - v_major_adjusted_total);

        v_minor_factor := CASE WHEN v_minor_total > 0 THEN v_minor_adjusted_total / v_minor_total ELSE 1.0 END;

        WITH prize_weights AS (
          SELECT pp.id, pp.level, pp.name, pp.image_url,
                 CASE
                   WHEN pp.level = ANY(v_major_prizes) AND pp.level NOT IN ('Last One', 'LAST ONE', '最後賞')
                     THEN pp.probability * v_profit_rate
                   WHEN pp.level IN ('Last One', 'LAST ONE', '最後賞')
                     THEN 0
                   ELSE pp.probability * v_minor_factor
                 END AS adjusted_weight
          FROM   product_prizes pp
          WHERE  pp.product_id = p_product_id AND pp.remaining > 0
            AND  pp.level NOT IN ('Last One', 'LAST ONE', '最後賞')
        ),
        prize_cdf AS (
          SELECT *, SUM(adjusted_weight) OVER (ORDER BY level ASC, id ASC) AS cum_weight,
                    SUM(adjusted_weight) OVER () AS total_weight
          FROM prize_weights
        )
        SELECT * INTO v_prize FROM prize_cdf
        WHERE cum_weight >= (v_random * total_weight)
        ORDER BY cum_weight ASC LIMIT 1;
      END IF;
    END IF;

    IF v_prize IS NULL THEN
      RAISE EXCEPTION 'No prizes left';
    END IF;

    v_row_spent        := LEAST(v_product_price, v_remaining_charge);
    v_remaining_charge := v_remaining_charge - v_row_spent;

    UPDATE product_prizes SET remaining = remaining - 1 WHERE id = v_prize.id;
    UPDATE products SET remaining = remaining - 1 WHERE id = p_product_id
    RETURNING remaining INTO v_product_remaining;

    INSERT INTO draw_records (
      user_id, product_id, ticket_number, prize_level, prize_name,
      txid_seed, txid_nonce, txid_hash, random_value, profit_rate,
      prize_image_url, product_prize_id, status, is_last_one, points_used, tokens_spent
    ) VALUES (
      v_user_id, p_product_id, v_ticket_no, v_prize.level, v_prize.name,
      v_seed, v_nonce, v_hash, v_random, v_profit_rate,
      v_prize.image_url, v_prize.id, 'in_warehouse', FALSE,
      CASE WHEN p_use_points THEN v_product_price ELSE 0 END, v_row_spent
    );

    v_prizes_drawn := v_prizes_drawn || jsonb_build_object(
      'grade', v_prize.level,
      'name', v_prize.name,
      'image_url', v_prize.image_url,
      'ticket_number', v_ticket_no,
      'is_last_one', false,
      'is_bonus', v_i > (v_draw_count - COALESCE(v_promo_bonus, 0))
    );
  END LOOP;

  -- 最後一抽觸發 Last One
  IF v_product_remaining = 0 THEN
    -- 條件用括號框起來。原本靠 AND 比 OR 優先來湊出正確語意，
    -- 讀起來像是「任何商品只要 is_last_one 就算」，改一個字就會變成真的那樣
    SELECT * INTO v_last_one_prize
    FROM   product_prizes
    WHERE  product_id = p_product_id
      AND  (level IN ('Last One', 'LAST ONE', '最後賞') OR is_last_one = TRUE)
    LIMIT 1;

    -- 用 FOUND 而不是 v_last_one_prize IS NOT NULL。
    -- PL/pgSQL 對 RECORD 的 IS NOT NULL 是「每個欄位都非 NULL」，
    -- 只要最後賞沒填圖片（image_url 為 NULL）整個判定就是 false ——
    -- 最後賞因此從來沒有發出去過，PROD 至今 0 筆最後賞紀錄。
    IF FOUND AND NOT EXISTS (
      SELECT 1 FROM draw_records WHERE product_id = p_product_id AND is_last_one = TRUE
    ) THEN
      UPDATE product_prizes SET remaining = 0 WHERE id = v_last_one_prize.id;

      DECLARE
        v_lo_seed  TEXT := md5(random()::text || clock_timestamp()::text);
        v_lo_nonce INTEGER := floor(random() * 1000000)::int;
      BEGIN
        -- 最後賞是加碼贈品，不收錢：tokens_spent = 0
        INSERT INTO draw_records (
          user_id, product_id, product_prize_id, ticket_number, prize_level, prize_name, status,
          txid_seed, txid_nonce, txid_hash, random_value, profit_rate, prize_image_url, is_last_one, points_used, tokens_spent
        ) VALUES (
          v_user_id, p_product_id, v_last_one_prize.id, 0,
          v_last_one_prize.level, v_last_one_prize.name, 'in_warehouse',
          v_lo_seed, v_lo_nonce, md5(v_lo_seed || v_lo_nonce::text), random(), 1.0,
          v_last_one_prize.image_url, TRUE,
          CASE WHEN p_use_points THEN v_product_price ELSE 0 END, 0
        );

        v_prizes_drawn := v_prizes_drawn || jsonb_build_object(
          'grade', v_last_one_prize.level,
          'name', v_last_one_prize.name,
          'image_url', v_last_one_prize.image_url,
          'ticket_number', 0,
          'is_last_one', true
        );
      END;
    END IF;
  END IF;

  RETURN v_prizes_drawn;
END;
$function$;


CREATE OR REPLACE FUNCTION public.play_ichiban_auto(p_product_id bigint, p_count integer, p_use_points boolean DEFAULT false, p_coupon_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user_id      UUID;
  v_type         TEXT;
  v_total_count  INTEGER;
  v_seal_len     INTEGER;
  v_per_pack     INTEGER;
  v_slot_total   INTEGER;
  v_pack_total   INTEGER;
  v_packs        INTEGER[];
  v_tickets      INTEGER[];
  v_prizes       JSONB;
  v_balance      INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF p_count IS NULL OR p_count < 1 THEN RAISE EXCEPTION 'Invalid draw count'; END IF;

  -- cards_per_pack：整包模式一抽開幾張（migration 584）。NULL/1 = 單張模式
  SELECT p.type, p.total_count, GREATEST(1, COALESCE(p.cards_per_pack, 1))
  INTO v_type, v_total_count, v_per_pack
  FROM public.products p WHERE p.id = p_product_id;

  IF v_type IS NULL THEN RAISE EXCEPTION 'Product not found'; END IF;
  IF v_type NOT IN ('card', 'custom') THEN
    RAISE EXCEPTION 'Wrong product type for this draw';
  END IF;

  SELECT array_length(s.assignment, 1) INTO v_seal_len
  FROM public.product_ticket_seals s WHERE s.product_id = p_product_id;
  -- 可配的籤位上限：有封存表就以封存長度為準（超出範圍的籤 play_ichiban 會擋）
  v_slot_total := LEAST(COALESCE(v_seal_len, v_total_count, 0), COALESCE(v_total_count, 0));

  IF v_per_pack = 1 THEN
    ------------------------------------------------------------------
    -- 單張模式：維持原本的隨機配籤
    ------------------------------------------------------------------
    IF p_count > 1000 THEN RAISE EXCEPTION 'Draw count too large'; END IF;

    SELECT array_agg(n) INTO v_tickets FROM (
      SELECT n FROM generate_series(1, v_slot_total) n
      WHERE NOT EXISTS (
        SELECT 1 FROM public.draw_records
        WHERE product_id = p_product_id AND ticket_number = n
      )
      ORDER BY random()
      LIMIT p_count
    ) s;

    IF v_tickets IS NULL OR array_length(v_tickets, 1) < p_count THEN
      RAISE EXCEPTION 'Not enough stock remaining';
    END IF;

    v_prizes := public.play_ichiban(p_product_id, v_tickets, p_use_points, p_coupon_id, p_count);
    v_packs := NULL;
  ELSE
    ------------------------------------------------------------------
    -- 整包模式：玩家買的是「一包」，不是散裝籤位。
    --
    -- 所以包不能在抽的當下臨時抓十個空籤位湊出來 —— 那是「十張散卡綁一起」，
    -- 不是卡包。包在開賣前就固定好了：第 k 包 = 籤位 (k-1)*每包+1 … k*每包，
    -- 而每個籤位開出什麼早就寫在封存表裡。所以「第 37 包裝了哪十張」在開賣前
    -- 就決定且可驗證，玩家事後拿包號去對封存表就知道我們沒有動手腳。
    ------------------------------------------------------------------
    IF p_count * v_per_pack > 1000 THEN RAISE EXCEPTION 'Draw count too large'; END IF;

    v_pack_total := v_slot_total / v_per_pack;   -- 整數除法：不足一包的尾數籤不成包
    IF v_pack_total < 1 THEN
      RAISE EXCEPTION 'Product has no complete pack (slots %, per pack %)', v_slot_total, v_per_pack;
    END IF;

    -- 挑「整包都還沒被動過」的包。只要包裡有任何一張被抽走，整包就不算完整，
    -- 不能再賣 —— 否則玩家付整包的錢卻拿到別人挑剩的
    SELECT array_agg(pack_no) INTO v_packs FROM (
      SELECT g AS pack_no
      FROM generate_series(1, v_pack_total) g
      WHERE NOT EXISTS (
        SELECT 1 FROM public.draw_records d
        WHERE d.product_id = p_product_id
          AND d.ticket_number BETWEEN (g - 1) * v_per_pack + 1 AND g * v_per_pack
      )
      ORDER BY random()
      LIMIT p_count
    ) s;

    IF v_packs IS NULL OR array_length(v_packs, 1) < p_count THEN
      RAISE EXCEPTION 'Not enough stock remaining';
    END IF;

    -- 把包號展開成籤位
    SELECT array_agg(n ORDER BY n) INTO v_tickets
    FROM unnest(v_packs) k, generate_series((k - 1) * v_per_pack + 1, k * v_per_pack) n;

    -- 只收 p_count 包的錢，但發整包的籤
    v_prizes := public.play_ichiban(p_product_id, v_tickets, p_use_points, p_coupon_id, p_count);
  END IF;

  NULL; -- total_draws 改由 track_mission_event 單一維護（migration 465）

  SELECT CASE WHEN p_use_points THEN points ELSE tokens END
  INTO v_balance FROM public.users WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'prizes', v_prizes,
    'new_balance', v_balance,
    'cards_per_pack', v_per_pack,
    'pack_numbers', to_jsonb(v_packs)   -- 玩家驗證用：第幾包
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.play_ichiban(bigint, integer[], boolean, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.play_ichiban_auto(bigint, integer, boolean, uuid) TO authenticated;

COMMIT;
