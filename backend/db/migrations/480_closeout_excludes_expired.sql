-- 480: 結案出清時，逾期釋出的籤要算成「未售出」
--
-- 479 讓逾期的籤回到可抽池（唯一索引排除 status='expired'）。
-- 但 close_out_product 判斷「哪些籤還沒賣掉」用的是
--   NOT EXISTS (SELECT 1 FROM draw_records WHERE ticket_number = i)
-- 逾期的紀錄還在表裡，所以那張籤會被當成「已賣出」——
-- 結果是：玩家抽得到那張籤，但結案時它不被列入未售出清單，
-- 兩邊對不起來，公平性揭曉頁的「未售出籤號」也會漏掉它。
--
-- 判斷條件要跟唯一索引一致：逾期的不算有效紀錄。

CREATE OR REPLACE FUNCTION public.close_out_product(
  p_product_id BIGINT,
  p_reason     TEXT DEFAULT NULL,
  p_closed_by  TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tickets INTEGER[];
  v_summary JSONB;
  v_count   INTEGER;
BEGIN
  SELECT array_agg(DISTINCT i ORDER BY i),
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
        WHERE d.product_id = p_product_id
          AND d.ticket_number = i
          -- 逾期釋出的籤已經回到可抽池，這裡也要當成未售出，
          -- 條件要跟 uq_draw_records_ticket 一致（migration 479）
          AND d.status <> 'expired'
      )
  ) x;

  IF v_tickets IS NULL THEN
    RAISE EXCEPTION 'NOTHING_TO_CLOSE: 此商品已完抽或尚未封存';
  END IF;

  v_count := array_length(v_tickets, 1);

  INSERT INTO product_closeouts (product_id, ticket_numbers, prize_summary, reason, closed_by)
  VALUES (p_product_id, v_tickets, v_summary, p_reason, p_closed_by);

  UPDATE products SET status = 'ended', ended_at = now() WHERE id = p_product_id;

  RETURN jsonb_build_object('closed_tickets', v_count, 'summary', v_summary);
END;
$function$;

COMMENT ON FUNCTION public.close_out_product IS
  '結案出清：把未售出的籤號與品項統計封存進 product_closeouts。逾期釋出的籤算未售出（見 migration 479/480）。不寫入 draw_records。';
