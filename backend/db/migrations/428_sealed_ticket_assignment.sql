-- 428: 一番賞改為「開賣前排定整檔對照表」
--
-- 現行機制在抽獎當下才算獎項，權重是「剩餘數量 × 殺率」。玩家要重算，
-- 必須知道在他之前誰抽走了什麼、順序如何 —— 這個設計本質上無法被驗證，
-- 跟殺率藏不藏無關。
--
-- 改成上架時就用種子把整檔籤排定並封存，抽獎只是查表：
--   1. 玩家把封存內容複製到任何 SHA-256 工具，比對商品頁公布的 commitment
--      → 相符即證明這張表開賣前就固定、中途沒被改
--   2. 查自己的籤號，比對倉庫品項 → 沒被掉包
--   3. 數各賞等數量，比對商品頁公告 → 沒有短少
--
-- 殺率保留，但從「抽獎時參與運算」變成「排籤時決定大獎位置」：
--   殺率 r% → 大獎不排進前 (100 - r)% 的籤
--   r = 100 不設限；r = 40 代表大獎最早出現在 60% 之後
-- 封存後不可改（有抽獎紀錄就鎖定），否則 commitment 會失去意義。

-- ── 封存表 ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_ticket_seals (
  product_id   BIGINT PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  salt         TEXT NOT NULL,
  -- 籤號 → product_prizes.id。索引 1 對應籤號 1
  assignment   BIGINT[] NOT NULL,
  -- 公開的承諾值：SHA-256(封存純文字)，上架時就公布
  commitment   TEXT NOT NULL,
  profit_rate  NUMERIC NOT NULL,
  sealed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  sealed_by    TEXT
);

COMMENT ON TABLE public.product_ticket_seals IS
  '一番賞／抽卡／自製賞的整檔籤號→獎項對照表。開賣前封存，完抽或結檔後才可公開。';

ALTER TABLE public.product_ticket_seals ENABLE ROW LEVEL SECURITY;

-- 前台一律不可直接讀 —— 未完抽就外洩等於公開答案。
-- 讀取只能透過 get_ticket_seal()，由它判斷是否已完抽。
DROP POLICY IF EXISTS "service role only on ticket seals" ON public.product_ticket_seals;
CREATE POLICY "service role only on ticket seals"
  ON public.product_ticket_seals FOR ALL
  USING (auth.role() = 'service_role');

-- ── 封存用的純文字格式 ──────────────────────────────────────────────────
-- 必須是玩家能複製、貼進任何 SHA-256 工具就算得出來的內容：
--   LF 換行、無結尾換行、UTF-8、賞等用原始代號
CREATE OR REPLACE FUNCTION public.build_seal_text(
  p_product_id BIGINT, p_salt TEXT, p_assignment BIGINT[]
) RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT concat_ws(E'\n',
    'GGB-FAIR-v1',
    'product:' || p_product_id,
    'tickets:' || array_length(p_assignment, 1),
    'salt:' || p_salt,
    (SELECT string_agg(i || ':' || pp.level, E'\n' ORDER BY i)
     FROM generate_subscripts(p_assignment, 1) AS i
     JOIN public.product_prizes pp ON pp.id = p_assignment[i])
  );
$$;

COMMENT ON FUNCTION public.build_seal_text IS
  '產生可被第三方 SHA-256 工具驗證的封存文字。格式異動等同破壞所有既有 commitment。';

-- ── 排籤 ────────────────────────────────────────────────────────────────
-- 種子決定順序，殺率決定大獎的最早位置。
--
-- 玩家的驗證途徑是 commitment（封存文字的 SHA-256），不是重跑這段洗牌 ——
-- setseed + random() 的求值順序會隨查詢計畫改變，不保證跨環境重現。
-- 種子留著是給內部稽核追來源用的，不要在前台宣稱「用種子可重算」。
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
  -- 有人抽過就不可重排：commitment 已經公布，改了玩家驗證必然失敗
  SELECT COUNT(*) INTO v_drawn FROM draw_records WHERE product_id = p_product_id;
  IF v_drawn > 0 THEN
    RAISE EXCEPTION 'ALREADY_SOLD: 已有 % 筆抽獎紀錄，封存後不可重排', v_drawn;
  END IF;

  SELECT COALESCE(profit_rate, 1.0) INTO v_rate FROM products WHERE id = p_product_id;
  IF v_rate IS NULL THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;

  v_seed := COALESCE(p_seed, encode(gen_random_bytes(32), 'hex'));
  v_salt := encode(gen_random_bytes(8), 'hex');

  -- 展開成一張一張的籤（數量 3 的賞項就出現 3 次），排除最後賞
  -- 大獎判定用數量佔比，不靠人工填 major_prizes —— 那個欄位 48 個商品全是空的，
  -- 而且填錯字不會報錯，只會靜默失效
  WITH pool AS (
    SELECT pp.id, pp.total,
           SUM(pp.total) OVER () AS all_total
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

  -- 殺率 r% → 大獎不排進前 (100 - r)% 的籤。r >= 100 視為不設限
  v_floor := FLOOR(v_total * GREATEST(0, 100 - LEAST(v_rate * 100, 100)) / 100.0);

  -- 種子決定洗牌順序：setseed 讓同一組輸入必定產生同一張表
  PERFORM setseed(('x' || substr(md5(v_seed), 1, 8))::bit(32)::int / 2147483648.0);

  WITH minor_shuffled AS (
    SELECT id, row_number() OVER (ORDER BY random()) AS rn
    FROM unnest(COALESCE(v_minor_ids, '{}')) AS id
  ),
  -- 大獎只能落在 v_floor 之後的位置
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
  -- 剩下的位置照順序填入普獎
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

  -- 種子沿用既有欄位，commitment 放 txid_hash（前台已經在顯示這兩個位置）
  UPDATE products SET seed = v_seed, txid_hash = v_commitment WHERE id = p_product_id;

  RETURN jsonb_build_object(
    'success', true, 'tickets', v_total, 'commitment', v_commitment,
    'major_count', COALESCE(array_length(v_major_ids, 1), 0), 'major_floor', v_floor
  );
END;
$$;

COMMENT ON FUNCTION public.seal_product_tickets IS
  '上架時排定整檔籤號→獎項並封存。已有抽獎紀錄時拒絕重排。';
