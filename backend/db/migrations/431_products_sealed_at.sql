-- 431: products.sealed_at
--
-- product_ticket_seals 是 service role only（未完抽前外洩整張表等於公開答案），
-- 但「這個商品封存了沒」本身不是秘密，後台殺率頁與前台商品頁都需要它。
-- 用 anon client 去查 product_ticket_seals 只會靜默拿到空陣列，
-- 拉桿看起來還能拖 —— 這種錯不會報，只會讓管理員以為調到了。

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sealed_at TIMESTAMPTZ;
COMMENT ON COLUMN public.products.sealed_at IS
  '排籤封存時間。非 NULL 代表殺率與賞項已鎖定，且商品頁可公布承諾值。';

CREATE OR REPLACE FUNCTION public.seal_product_tickets(
  p_product_id BIGINT,
  p_seed       TEXT DEFAULT NULL,
  p_sealed_by  TEXT DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_seed        TEXT;
  v_salt        TEXT;
  v_rate        NUMERIC;
  v_total       INTEGER;
  v_drawn       INTEGER;
  v_major_ids   BIGINT[];
  v_minor_ids   BIGINT[];
  v_floor       INTEGER;
  v_assignment  BIGINT[];
  v_text        TEXT;
  v_commitment  TEXT;
BEGIN
  SELECT COUNT(*) INTO v_drawn FROM draw_records WHERE product_id = p_product_id;
  IF v_drawn > 0 THEN
    RAISE EXCEPTION 'ALREADY_SOLD: 已有 % 筆抽獎紀錄，封存後不可重排', v_drawn;
  END IF;

  SELECT COALESCE(profit_rate, 1.0) INTO v_rate FROM products WHERE id = p_product_id;
  IF v_rate IS NULL THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;

  v_seed := COALESCE(p_seed, encode(gen_random_bytes(32), 'hex'));
  v_salt := encode(gen_random_bytes(8), 'hex');

  WITH pool AS (
    SELECT pp.id, pp.total, SUM(pp.total) OVER () AS all_total
    FROM product_prizes pp
    WHERE pp.product_id = p_product_id
      AND pp.level NOT IN ('Last One', 'LAST ONE', '最後賞')
      AND pp.total > 0
  ),
  expanded AS (
    SELECT id, (total::numeric / all_total) <= 0.05 AS is_major
    FROM pool, generate_series(1, total)
  )
  SELECT array_agg(id) FILTER (WHERE is_major),
         array_agg(id) FILTER (WHERE NOT is_major)
  INTO v_major_ids, v_minor_ids
  FROM expanded;

  v_total := COALESCE(array_length(v_major_ids, 1), 0) + COALESCE(array_length(v_minor_ids, 1), 0);
  IF v_total = 0 THEN RAISE EXCEPTION 'NO_PRIZES'; END IF;

  v_floor := FLOOR(v_total * GREATEST(0, 100 - LEAST(v_rate * 100, 100)) / 100.0);

  PERFORM setseed(('x' || substr(md5(v_seed), 1, 8))::bit(32)::int / 2147483648.0);

  WITH minor_shuffled AS (
    SELECT id, row_number() OVER (ORDER BY random()) AS rn
    FROM unnest(COALESCE(v_minor_ids, '{}')) AS id
  ),
  major_slots AS (
    SELECT pos, row_number() OVER (ORDER BY random()) AS rn
    FROM generate_series(v_floor + 1, v_total) AS pos
  ),
  major_placed AS (
    SELECT m.id, s.pos
    FROM (SELECT id, row_number() OVER (ORDER BY random()) AS rn
          FROM unnest(COALESCE(v_major_ids, '{}')) AS id) m
    JOIN major_slots s USING (rn)
  ),
  free_slots AS (
    SELECT pos, row_number() OVER (ORDER BY pos) AS rn
    FROM generate_series(1, v_total) AS pos
    WHERE pos NOT IN (SELECT pos FROM major_placed)
  ),
  minor_placed AS (
    SELECT m.id, f.pos FROM minor_shuffled m JOIN free_slots f USING (rn)
  )
  SELECT array_agg(id ORDER BY pos)
  INTO v_assignment
  FROM (SELECT * FROM major_placed UNION ALL SELECT * FROM minor_placed) x;

  v_text       := public.build_seal_text(p_product_id, v_salt, v_assignment);
  v_commitment := encode(digest(convert_to(v_text, 'utf8'), 'sha256'), 'hex');

  INSERT INTO product_ticket_seals (product_id, salt, assignment, commitment, profit_rate, sealed_by)
  VALUES (p_product_id, v_salt, v_assignment, v_commitment, v_rate, p_sealed_by)
  ON CONFLICT (product_id) DO UPDATE
    SET salt = EXCLUDED.salt, assignment = EXCLUDED.assignment,
        commitment = EXCLUDED.commitment, profit_rate = EXCLUDED.profit_rate,
        sealed_at = now(), sealed_by = EXCLUDED.sealed_by;

  UPDATE products
     SET seed = v_seed, txid_hash = v_commitment, sealed_at = now()
   WHERE id = p_product_id;

  RETURN jsonb_build_object(
    'success', true, 'tickets', v_total, 'commitment', v_commitment,
    'major_count', COALESCE(array_length(v_major_ids, 1), 0), 'major_floor', v_floor
  );
END;
$$;

-- 428~430 期間建立的封存補上 sealed_at
UPDATE products p SET sealed_at = s.sealed_at
FROM product_ticket_seals s
WHERE s.product_id = p.id AND p.sealed_at IS NULL;
