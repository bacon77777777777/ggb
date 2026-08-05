-- 440: 抽籤販售的抽獎、落選籤、期限、分解與寄出付款
--
-- 沿用既有的封存排籤：抽籤販售的商品一樣在上架時把整檔籤排定並公布承諾值，
-- 玩家一樣能在 /fairness/[id] 驗證。差別只在於籤裡有一種叫「未中獎」。

BEGIN;

-- ── 落選籤：補成一個真的 product_prizes 資料列 ──────────────────────────
-- 封存表是 籤號 → product_prizes.id，落選必須有個真的 id 才進得去。
-- 數量 = 總抽獎次數 − 各獎項數量加總。
CREATE OR REPLACE FUNCTION public.ensure_lottery_blank_prize(p_product_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_total  INTEGER;
  v_wins   INTEGER;
  v_blanks INTEGER;
BEGIN
  SELECT lottery_total_draws INTO v_total
  FROM products WHERE id = p_product_id AND sale_mode = 'lottery';
  IF v_total IS NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(total), 0) INTO v_wins
  FROM product_prizes WHERE product_id = p_product_id AND level <> '未中獎';

  v_blanks := v_total - v_wins;
  IF v_blanks < 0 THEN
    RAISE EXCEPTION 'LOTTERY_OVERSUBSCRIBED: 獎項共 % 個，超過總抽獎次數 %', v_wins, v_total;
  END IF;

  DELETE FROM product_prizes WHERE product_id = p_product_id AND level = '未中獎';

  IF v_blanks > 0 THEN
    INSERT INTO product_prizes (product_id, level, name, total, remaining, probability, sale_price)
    VALUES (p_product_id, '未中獎', '銘謝惠顧', v_blanks, v_blanks, 0, 0);
  END IF;
END;
$$;

COMMENT ON FUNCTION public.ensure_lottery_blank_prize IS
  '抽籤販售：把落選籤補成一個 level = 未中獎 的品項，讓封存排籤不需特例處理。';

-- 封存前先補落選籤，否則排出來的籤數會少掉落選那一段
CREATE OR REPLACE FUNCTION public.try_auto_seal(p_product_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
        SELECT 1 FROM products
         WHERE id = p_product_id
           AND type IN ('ichiban', 'card', 'custom')
           AND is_active
     )
     AND NOT EXISTS (SELECT 1 FROM product_ticket_seals WHERE product_id = p_product_id)
     AND NOT EXISTS (SELECT 1 FROM draw_records WHERE product_id = p_product_id)
     AND EXISTS (SELECT 1 FROM product_prizes WHERE product_id = p_product_id AND total > 0)
  THEN
    -- 抽籤販售要先把落選籤補齊再排
    PERFORM public.ensure_lottery_blank_prize(p_product_id);
    PERFORM public.seal_product_tickets(p_product_id, NULL, 'auto:publish');
  END IF;
END $$;

-- ── 抽籤 ────────────────────────────────────────────────────────────────
-- 不扣代幣。兩個上限都擋：整檔總次數（= 籤數）與每人次數。
CREATE OR REPLACE FUNCTION public.play_lottery(p_product_id BIGINT, p_count INTEGER)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
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
  IF NOT pg_try_advisory_xact_lock(hashtext('draw:product:' || p_product_id::text)) THEN
    RAISE EXCEPTION 'PRODUCT_BUSY';
  END IF;

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
$$;

COMMENT ON FUNCTION public.play_lottery IS
  '抽籤販售抽獎。不扣代幣，擋每人上限，落選寫 status = lost（不進倉庫但留紀錄）。';

GRANT EXECUTE ON FUNCTION public.play_lottery(BIGINT, INTEGER) TO authenticated;

COMMIT;
