-- 453: 商品鎖由「拒絕」改為「排隊」
--
-- 原本四支抽獎函數都用 pg_try_advisory_xact_lock 鎖住整個商品，
-- 拿不到就直接 RAISE 'PRODUCT_BUSY'。這是 try，不是等待。
--
-- 後果是商品越熱門越抽不到：同商品的併發只要超過單筆交易時間，
-- 後面的人全部收到錯誤 —— 而剛上架的熱門一番賞正是所有人一起擠的時候。
--
-- 之所以敢降級，是因為 451 已經用唯一索引保證了籤號不會被重複領走。
-- 在那之前正確性完全靠這把鎖（TICKET_ALREADY_DRAWN 是 check-then-insert），
-- 拿掉會直接出現兩個人抽到同一張籤。
--
-- 使用者鎖（draw:user:）維持拒絕：拿不到代表同一個人重複送出，本來就該擋。
--
-- lock_timeout 5 秒是保險。等待會佔住連線，真的塞到 5 秒代表上游已經爆了，
-- 這時繼續堆著等只會把連線池吃光，不如讓它失敗得快一點。

CREATE OR REPLACE FUNCTION public.play_ichiban_locked(p_product_id bigint, p_ticket_numbers integer[], p_use_points boolean DEFAULT false, p_coupon_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT pg_try_advisory_xact_lock(hashtext('draw:user:' || v_user_id::text)) THEN
    RAISE EXCEPTION 'DRAW_IN_PROGRESS';
  END IF;

  -- 商品鎖改為等待而非拒絕。
  -- 原本用 pg_try_advisory_xact_lock，拿不到就直接 PRODUCT_BUSY ——
  -- 商品越熱門失敗率越高，而熱門正是我們希望它能賣的時候。
  -- 籤號唯一性已由 uq_draw_records_ticket 保證（migration 451），
  -- 這把鎖現在只負責排順序，等得起就不該拒絕。
  -- lock_timeout 是保險：真的塞到 5 秒表示上游已經爆掉，
  -- 這時堆著等只會把連線池吃光，不如讓它失敗。
  SET LOCAL lock_timeout = '5s';
  PERFORM pg_advisory_xact_lock(hashtext('draw:product:' || p_product_id::text));

  RETURN public.play_ichiban(p_product_id, p_ticket_numbers, p_use_points, p_coupon_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.play_ichiban_auto_locked(p_product_id bigint, p_count integer, p_use_points boolean DEFAULT false, p_coupon_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT pg_try_advisory_xact_lock(hashtext('draw:user:' || v_user_id::text)) THEN
    RAISE EXCEPTION 'DRAW_IN_PROGRESS';
  END IF;

  -- 商品鎖改為等待而非拒絕。
  -- 原本用 pg_try_advisory_xact_lock，拿不到就直接 PRODUCT_BUSY ——
  -- 商品越熱門失敗率越高，而熱門正是我們希望它能賣的時候。
  -- 籤號唯一性已由 uq_draw_records_ticket 保證（migration 451），
  -- 這把鎖現在只負責排順序，等得起就不該拒絕。
  -- lock_timeout 是保險：真的塞到 5 秒表示上游已經爆掉，
  -- 這時堆著等只會把連線池吃光，不如讓它失敗。
  SET LOCAL lock_timeout = '5s';
  PERFORM pg_advisory_xact_lock(hashtext('draw:product:' || p_product_id::text));

  RETURN public.play_ichiban_auto(p_product_id, p_count, p_use_points, p_coupon_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.play_gacha_locked(p_product_id bigint, p_count integer, p_use_points boolean DEFAULT false, p_coupon_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT pg_try_advisory_xact_lock(hashtext('draw:user:' || v_user_id::text)) THEN
    RAISE EXCEPTION 'DRAW_IN_PROGRESS';
  END IF;

  -- 商品鎖改為等待而非拒絕。
  -- 原本用 pg_try_advisory_xact_lock，拿不到就直接 PRODUCT_BUSY ——
  -- 商品越熱門失敗率越高，而熱門正是我們希望它能賣的時候。
  -- 籤號唯一性已由 uq_draw_records_ticket 保證（migration 451），
  -- 這把鎖現在只負責排順序，等得起就不該拒絕。
  -- lock_timeout 是保險：真的塞到 5 秒表示上游已經爆掉，
  -- 這時堆著等只會把連線池吃光，不如讓它失敗。
  SET LOCAL lock_timeout = '5s';
  PERFORM pg_advisory_xact_lock(hashtext('draw:product:' || p_product_id::text));

  RETURN public.play_gacha(p_product_id, p_count, p_use_points, p_coupon_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.play_lottery(p_product_id bigint, p_count integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_user_id     UUID;
  v_mode        TEXT;
  v_active      BOOLEAN;
  v_per_user    INTEGER;
  v_seal_len    INTEGER;
  v_commitment  TEXT;
  v_used_by_me  INTEGER;
  v_tickets     INTEGER[];
  v_ticket      INTEGER;
  v_prize       RECORD;
  v_hold_days   INTEGER := 30;
  v_out         JSONB := '[]'::jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_count IS NULL OR p_count < 1 OR p_count > 50 THEN
    RAISE EXCEPTION 'INVALID_COUNT';
  END IF;

  SELECT sale_mode, is_active, lottery_per_user_draws
  INTO v_mode, v_active, v_per_user
  FROM products WHERE id = p_product_id;

  IF v_mode IS NULL THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;
  IF v_mode <> 'lottery' THEN RAISE EXCEPTION 'NOT_LOTTERY'; END IF;
  IF NOT v_active THEN RAISE EXCEPTION 'PRODUCT_INACTIVE'; END IF;

  -- 同一人不可並行抽，否則兩筆交易會各自讀到舊的已抽次數而雙雙通過上限檢查
  IF NOT pg_try_advisory_xact_lock(hashtext('draw:user:' || v_user_id::text)) THEN
    RAISE EXCEPTION 'DRAW_IN_PROGRESS';
  END IF;
  -- 商品鎖改為等待而非拒絕。
  -- 原本用 pg_try_advisory_xact_lock，拿不到就直接 PRODUCT_BUSY ——
  -- 商品越熱門失敗率越高，而熱門正是我們希望它能賣的時候。
  -- 籤號唯一性已由 uq_draw_records_ticket 保證（migration 451），
  -- 這把鎖現在只負責排順序，等得起就不該拒絕。
  -- lock_timeout 是保險：真的塞到 5 秒表示上游已經爆掉，
  -- 這時堆著等只會把連線池吃光，不如讓它失敗。
  SET LOCAL lock_timeout = '5s';
  PERFORM pg_advisory_xact_lock(hashtext('draw:product:' || p_product_id::text));

  SELECT array_length(assignment, 1), commitment
  INTO v_seal_len, v_commitment
  FROM product_ticket_seals WHERE product_id = p_product_id;
  IF v_seal_len IS NULL THEN RAISE EXCEPTION 'NOT_SEALED'; END IF;

  SELECT COUNT(*) INTO v_used_by_me
  FROM draw_records WHERE product_id = p_product_id AND user_id = v_user_id;
  IF v_used_by_me + p_count > v_per_user THEN
    RAISE EXCEPTION 'PER_USER_LIMIT: 每人限抽 % 次，你已抽 % 次', v_per_user, v_used_by_me;
  END IF;

  -- 從還沒被抽走的籤號隨機取。整檔總次數就是籤數，不需另外檢查
  SELECT array_agg(n) INTO v_tickets FROM (
    SELECT n FROM generate_series(1, v_seal_len) n
    WHERE NOT EXISTS (
      SELECT 1 FROM draw_records d
      WHERE d.product_id = p_product_id AND d.ticket_number = n
    )
    ORDER BY random() LIMIT p_count
  ) s;

  IF v_tickets IS NULL OR array_length(v_tickets, 1) < p_count THEN
    RAISE EXCEPTION 'SOLD_OUT: 剩餘次數不足';
  END IF;

  FOREACH v_ticket IN ARRAY v_tickets LOOP
    SELECT pp.id, pp.level, pp.name, pp.image_url, pp.sale_price
    INTO v_prize
    FROM product_ticket_seals s
    JOIN product_prizes pp ON pp.id = s.assignment[v_ticket]
    WHERE s.product_id = p_product_id;

    INSERT INTO draw_records (
      user_id, product_id, product_prize_id, ticket_number,
      prize_level, prize_name, prize_image_url,
      txid_seed, txid_nonce, txid_hash, random_value, profit_rate,
      status, is_last_one, points_used, expires_at
    ) VALUES (
      v_user_id, p_product_id, v_prize.id, v_ticket,
      v_prize.level, v_prize.name, v_prize.image_url,
      '', v_ticket, v_commitment, 0, 1.0,
      -- 落選也要留紀錄（要能查誰抽過幾次），但不是 in_warehouse 就不會進倉庫
      CASE WHEN v_prize.level = '未中獎' THEN 'lost' ELSE 'in_warehouse' END,
      FALSE, 0,
      CASE WHEN v_prize.level = '未中獎' THEN NULL
           ELSE now() + (v_hold_days || ' days')::INTERVAL END
    );

    UPDATE product_prizes SET remaining = GREATEST(0, remaining - 1) WHERE id = v_prize.id;

    v_out := v_out || jsonb_build_object(
      'ticket_number', v_ticket,
      'won',        v_prize.level <> '未中獎',
      'grade',      v_prize.level,
      'name',       v_prize.name,
      'image_url',  v_prize.image_url,
      'sale_price', v_prize.sale_price
    );
  END LOOP;

  UPDATE products SET remaining = GREATEST(0, remaining - p_count) WHERE id = p_product_id;

  RETURN jsonb_build_object(
    'success', TRUE, 'results', v_out,
    'used_by_me', v_used_by_me + p_count, 'per_user_limit', v_per_user
  );
END;
$function$;
