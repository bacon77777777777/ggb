-- 513: 拆解退還記實際金額，token_ledger 不再用整顆單價亂記
--
-- 問題（帳本 view 的錯，實際金流一直是對的）：
--   玩家抽一抽 150 → 拆解實際只退 10（或 decompose 設定值），
--   但 token_ledger 把已拆解那筆的 -150 支出整個踢掉，再記一筆「拆解退還 +單價」。
--   現實淨支出 140，帳本卻寫淨賺 150 —— 拆解越多、對帳越歪。
--
-- 修法（跟 512 的 tokens_spent 同一招）：
--   1. draw_records.refund_amount：拆解當下記實際退還
--   2. dismantle_prizes 寫入
--   3. token_ledger：抽獎支出照記（拆解與否都花了錢），退還記實際數
--   4. 歷史資料從 admin_recycle_pool（拆解當下就有記 recycle_value）回填

ALTER TABLE public.draw_records ADD COLUMN IF NOT EXISTS refund_amount integer;

COMMENT ON COLUMN public.draw_records.refund_amount IS
  '拆解實際退還的 G 幣（dismantle_prizes 寫入）。NULL = 未拆解或舊資料（舊資料由 admin_recycle_pool 回填；回填不到的在帳本以 0 計，寧可少算退還不多算）。';

-- ── dismantle_prizes：拆解時記下實際退還 ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.dismantle_prizes(p_record_ids bigint[], p_user_id uuid)
 RETURNS TABLE(success_count integer, total_refund integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_record      RECORD;
  v_refund      INTEGER := 0;
  v_count       INTEGER := 0;
  v_prize_value INTEGER;
BEGIN
  FOR v_record IN
    SELECT
      dr.id,
      dr.product_prize_id,
      pp.total,
      pp.decompose_type,
      pp.decompose_value,
      p.price,
      p.type AS product_type
    FROM   public.draw_records   dr
    JOIN   public.product_prizes pp ON pp.id = dr.product_prize_id
    JOIN   public.products       p  ON p.id  = pp.product_id
    WHERE  dr.id      = ANY(p_record_ids)
      AND  dr.user_id = p_user_id
      AND  dr.status  = 'in_warehouse'
      -- 抽籤販售的中籤品項不可分解：那是 0 元抽來的，
      -- 分解等於沒付一毛錢就換到 G 幣
      AND  p.sale_mode <> 'lottery'
  LOOP
    -- 轉蛋、盒玩：固定 10 代幣
    IF v_record.product_type IN ('gacha', 'blindbox') THEN
      v_prize_value := 10;

    -- 手動設定 %
    ELSIF v_record.decompose_type = 'percent' AND v_record.decompose_value IS NOT NULL THEN
      v_prize_value := GREATEST(1, FLOOR(v_record.price * v_record.decompose_value / 100));

    -- 手動設定固定代幣
    ELSIF v_record.decompose_type = 'fixed' AND v_record.decompose_value IS NOT NULL THEN
      v_prize_value := v_record.decompose_value;

    -- auto：依初始庫存判斷
    ELSE
      IF v_record.total <= 3 THEN
        v_prize_value := GREATEST(1, FLOOR(v_record.price * 0.2));
      ELSE
        v_prize_value := 10;
      END IF;
    END IF;

    -- 實際退還金額一併記錄，token_ledger 的「拆解退還」讀這個
    UPDATE public.draw_records
    SET status = 'dismantled', refund_amount = v_prize_value
    WHERE id = v_record.id;

    -- 轉蛋/盒玩：分解後庫存歸還（廠商仍持有實物，可再次出貨）
    -- 一番賞/抽卡/自製賞為序列商品不加回，避免破壞抽獎順序與種子驗證
    IF v_record.product_type IN ('gacha', 'blindbox') AND v_record.product_prize_id IS NOT NULL THEN
      UPDATE public.product_prizes
      SET remaining = COALESCE(remaining, 0) + 1
      WHERE id = v_record.product_prize_id;
    END IF;

    INSERT INTO public.admin_recycle_pool (
      draw_record_id, user_id, product_id, prize_name, prize_level, recycle_value
    )
    SELECT v_record.id, p_user_id, pp.product_id, pp.name, pp.level, v_prize_value
    FROM   public.product_prizes pp
    WHERE  pp.id = v_record.product_prize_id
    ON CONFLICT DO NOTHING;

    v_refund := v_refund + v_prize_value;
    v_count  := v_count  + 1;
  END LOOP;

  IF v_refund > 0 THEN
    UPDATE public.users
    SET tokens = COALESCE(tokens, 0) + v_refund
    WHERE id = p_user_id;
  END IF;

  RETURN QUERY SELECT v_count, v_refund;
END;
$function$;

-- ── 回填：舊拆解紀錄從 admin_recycle_pool 拿實際退還 ─────────────────────────

UPDATE public.draw_records dr
SET refund_amount = arp.recycle_value
FROM public.admin_recycle_pool arp
WHERE arp.draw_record_id = dr.id
  AND dr.status = 'dismantled'
  AND dr.refund_amount IS NULL;

-- ── token_ledger：抽獎支出照記、退還記實際數 ─────────────────────────────────
-- 語意變更：
--   draw（G幣）不再排除已拆解 —— 錢確實花了，支出照記（-tokens_spent，舊資料 fallback 單價）
--   dismantle 只記實際退還（+refund_amount；回填不到的以 0 計，寧可少算退還不多算）
--   積分抽獎的拆解退還也是退 G 幣，同一條 dismantle 分支涵蓋
-- 欄位增減與型別不變，CREATE OR REPLACE 可直接套。

CREATE OR REPLACE VIEW public.token_ledger AS
 SELECT
        CASE
            WHEN rr.payment_method::text = 'test'::text THEN 'test'::text
            WHEN rr.payment_method::text = ANY (ARRAY['promotion'::character varying, 'compensation'::character varying]::text[]) THEN 'marketing'::text
            ELSE 'recharge'::text
        END AS type,
    rr.user_id,
        CASE
            WHEN rr.status::text = 'success'::text THEN (rr.amount + COALESCE(rr.bonus, 0::numeric))::bigint
            ELSE 0::bigint
        END AS delta,
        CASE
            WHEN rr.payment_method::text = 'test'::text THEN concat('測試 ', rr.order_number)
            WHEN rr.payment_method::text = ANY (ARRAY['promotion'::character varying, 'compensation'::character varying]::text[]) THEN concat('行銷贈點 ', rr.order_number)
            ELSE concat('儲值 ', rr.order_number)
        END AS description,
    rr.status,
    rr.amount::bigint AS recharge_amount,
    COALESCE(rr.bonus, 0::numeric)::bigint AS recharge_bonus,
    rr.id AS ref_id,
    rr.created_at
   FROM recharge_records rr
UNION ALL
 SELECT 'draw'::text AS type,
    dr.user_id,
    - COALESCE(dr.tokens_spent::numeric, p.price, 0::numeric)::bigint AS delta,
    concat('抽獎：', COALESCE(dr.prize_name, ''::character varying)) AS description,
    dr.status,
    NULL::bigint AS recharge_amount,
    NULL::bigint AS recharge_bonus,
    dr.id AS ref_id,
    dr.created_at
   FROM draw_records dr
     LEFT JOIN products p ON dr.product_id = p.id
  WHERE dr.points_used = 0
UNION ALL
 SELECT 'draw'::text AS type,
    dr.user_id,
    - dr.points_used::bigint AS delta,
    concat('抽獎：', COALESCE(dr.prize_name, ''::character varying)) AS description,
    dr.status,
    NULL::bigint AS recharge_amount,
    NULL::bigint AS recharge_bonus,
    dr.id AS ref_id,
    dr.created_at
   FROM draw_records dr
  WHERE dr.points_used > 0
UNION ALL
 SELECT 'dismantle'::text AS type,
    dr.user_id,
    COALESCE(dr.refund_amount, 0)::bigint AS delta,
    concat('拆解退還：', COALESCE(dr.prize_name, ''::character varying)) AS description,
    dr.status,
    NULL::bigint AS recharge_amount,
    NULL::bigint AS recharge_bonus,
    dr.id AS ref_id,
    dr.created_at
   FROM draw_records dr
  WHERE dr.status::text = 'dismantled'::text
UNION ALL
 SELECT 'manual'::text AS type,
    ta.user_id,
    ta.delta,
    concat('手動調整：', ta.reason, '（', ta.created_by, '）') AS description,
    'processed'::character varying AS status,
    NULL::bigint AS recharge_amount,
    NULL::bigint AS recharge_bonus,
    ta.id AS ref_id,
    ta.created_at
   FROM token_adjustments ta;
