-- 430: 封存表公開規則 + 平台結檔
--
-- 兩件事：
--
-- 1. 公開時機
--    未完抽就公開整張表 = 公開答案，誰都能挑走 A 賞的籤號。
--    所以只有「完抽」或「已結檔」的商品才給看，未完抽的只給承諾值與自己抽過的籤。
--
-- 2. 結檔
--    老闆的要求：整檔沒賣完也要能標成已完抽並保持上架，而且不可以用機器人帳號抽掉 ——
--    機器人是為了「不影響報表」才存在的，拿它來吃庫存等於把庫存損耗記成假抽獎，
--    報表看起來會像有人真的抽了。
--    改為平台直接回收剩餘籤：不產生 draw_records、不動任何用戶餘額，
--    只在 product_closeouts 留一筆帳，剩下的實體品項歸平台庫存。

-- ── 結檔紀錄 ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_closeouts (
  id           BIGSERIAL PRIMARY KEY,
  product_id   BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  -- 平台回收的籤號，供公開驗證時標示「這些沒有賣出去」
  ticket_numbers INTEGER[] NOT NULL,
  -- 回收的品項統計，例如 {"A": 1, "C": 3}
  prize_summary  JSONB NOT NULL,
  reason       TEXT,
  closed_by    TEXT,
  closed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_closeouts_product ON public.product_closeouts(product_id);

COMMENT ON TABLE public.product_closeouts IS
  '平台結檔：未售完就結束的檔期，剩餘籤由平台回收，實體品項歸平台庫存。不產生抽獎紀錄。';

ALTER TABLE public.product_closeouts ENABLE ROW LEVEL SECURITY;

-- 前台要顯示「哪些籤是平台回收的」，所以可讀；寫入只走 RPC
DROP POLICY IF EXISTS "anyone can read closeouts" ON public.product_closeouts;
CREATE POLICY "anyone can read closeouts"
  ON public.product_closeouts FOR SELECT USING (true);

-- ── 結檔 ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.close_out_product(
  p_product_id BIGINT,
  p_reason     TEXT DEFAULT NULL,
  p_closed_by  TEXT DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_tickets INTEGER[];
  v_summary JSONB;
  v_count   INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM product_closeouts WHERE product_id = p_product_id) THEN
    RAISE EXCEPTION 'ALREADY_CLOSED';
  END IF;

  -- 沒賣出去的籤 = 封存表裡沒有對應 draw_records 的籤號
  SELECT array_agg(i ORDER BY i),
         jsonb_object_agg(level, cnt)
  INTO v_tickets, v_summary
  FROM (
    SELECT i, pp.level, COUNT(*) OVER (PARTITION BY pp.level) AS cnt
    FROM product_ticket_seals s
    CROSS JOIN LATERAL generate_subscripts(s.assignment, 1) i
    JOIN product_prizes pp ON pp.id = s.assignment[i]
    WHERE s.product_id = p_product_id
      AND NOT EXISTS (
        SELECT 1 FROM draw_records d
        WHERE d.product_id = p_product_id AND d.ticket_number = i
      )
  ) x;

  IF v_tickets IS NULL THEN
    RAISE EXCEPTION 'NOTHING_TO_CLOSE: 此商品已完抽或尚未封存';
  END IF;

  v_count := array_length(v_tickets, 1);

  INSERT INTO product_closeouts (product_id, ticket_numbers, prize_summary, reason, closed_by)
  VALUES (p_product_id, v_tickets, v_summary, p_reason, p_closed_by);

  -- 剩餘歸零，商品仍可上架顯示為已完抽
  UPDATE product_prizes pp SET remaining = 0 WHERE pp.product_id = p_product_id;
  UPDATE products SET remaining = 0 WHERE id = p_product_id;

  RETURN jsonb_build_object(
    'success', true, 'closed_tickets', v_count, 'prize_summary', v_summary
  );
END;
$$;

COMMENT ON FUNCTION public.close_out_product IS
  '平台回收未售出的籤並結檔。不寫 draw_records、不動用戶餘額，故不影響任何報表。';

-- ── 公開封存表 ──────────────────────────────────────────────────────────
-- 完抽或已結檔才給整張表；未完抽只給承諾值（讓玩家先存證，事後再比對）
CREATE OR REPLACE FUNCTION public.get_ticket_seal(p_product_id BIGINT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_seal      RECORD;
  v_remaining INTEGER;
  v_closed    BOOLEAN;
BEGIN
  SELECT * INTO v_seal FROM product_ticket_seals WHERE product_id = p_product_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('sealed', false);
  END IF;

  SELECT remaining INTO v_remaining FROM products WHERE id = p_product_id;
  v_closed := EXISTS (SELECT 1 FROM product_closeouts WHERE product_id = p_product_id);

  IF COALESCE(v_remaining, 1) > 0 AND NOT v_closed THEN
    -- 尚在販售：只公布承諾值。整張表這時給出去等於公開答案
    RETURN jsonb_build_object(
      'sealed', true, 'revealed', false,
      'commitment', v_seal.commitment,
      'tickets', array_length(v_seal.assignment, 1),
      'sealed_at', v_seal.sealed_at
    );
  END IF;

  RETURN jsonb_build_object(
    'sealed', true, 'revealed', true,
    'commitment', v_seal.commitment,
    'tickets', array_length(v_seal.assignment, 1),
    'sealed_at', v_seal.sealed_at,
    -- 玩家把這段原文丟進任何 SHA-256 工具，算出來必須等於 commitment
    'seal_text', public.build_seal_text(p_product_id, v_seal.salt, v_seal.assignment),
    'closed_out', (SELECT ticket_numbers FROM product_closeouts WHERE product_id = p_product_id)
  );
END;
$$;

COMMENT ON FUNCTION public.get_ticket_seal IS
  '取封存資訊。販售中只回承諾值，完抽或結檔後才回整張表與可驗證原文。';

GRANT EXECUTE ON FUNCTION public.get_ticket_seal(BIGINT) TO anon, authenticated;
