-- 620: 回收的結算方式可設定（老闆 2026-08-25）
--
-- 老闆要的：「不跟廠商收回收價，但差額平台全部賺取」。
-- 用他的例子：轉蛋單抽 100G，玩家回收拿 15G，差額就是 85G，這 85 要不要分給廠商可設定。
--
-- 所以被回收的那一筆抽獎，結算方式有兩種，二選一（不會同時套用，避免重複計算）：
--
--   charge ── 現行做法。抽獎照一般分潤率分給廠商，回收價再從廠商結算扣除。
--   margin ── 差額分潤。被回收的抽獎「不走一般分潤」，改成
--             差額 =（單抽價 − 回收價），依 supplier_share 拆給廠商，其餘平台全拿。
--             回收價由平台從那筆營收裡出，不另外跟廠商收。
--
-- 預設 margin + supplier_share = 0 → 平台出回收價、差額全拿，廠商 0（但貨還在他倉庫）。

-- ── ① 記帳當下就把數字寫死 ─────────────────────────────────
-- 費率會隨時被後台調動，事後拿當前費率回推歷史一定算錯。
ALTER TABLE public.admin_recycle_pool
  ADD COLUMN IF NOT EXISTS unit_price integer,
  ADD COLUMN IF NOT EXISTS margin     integer,
  ADD COLUMN IF NOT EXISTS trigger    text NOT NULL DEFAULT 'manual';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='admin_recycle_pool_trigger_check'
                   AND conrelid='public.admin_recycle_pool'::regclass) THEN
    ALTER TABLE public.admin_recycle_pool
      ADD CONSTRAINT admin_recycle_pool_trigger_check CHECK (trigger IN ('manual','expired'));
  END IF;
END $$;

COMMENT ON COLUMN public.admin_recycle_pool.unit_price IS '回收當下的商品單抽價，結算差額的基準';
COMMENT ON COLUMN public.admin_recycle_pool.margin     IS '差額＝單抽價 − 回收價。margin 模式下依此分潤';
COMMENT ON COLUMN public.admin_recycle_pool.trigger    IS 'manual 玩家自己按／expired 倉庫逾期自動回收';

-- 回填既有 1,562 筆（用當時商品的單價；歷史單價若已調動就是近似值，
-- 但這批全是測試資料，且改版前根本沒有差額分潤，不影響任何已結算的帳）
UPDATE public.admin_recycle_pool arp
SET    unit_price = p.price::integer,
       margin     = GREATEST(0, p.price::integer - COALESCE(arp.recycle_value, 0))
FROM   public.products p
WHERE  p.id = arp.product_id AND arp.unit_price IS NULL;

-- ── ② 結算設定：全站預設 ───────────────────────────────────
INSERT INTO public.platform_settings (key, value) VALUES
  ('recycle_settlement_mode',        'margin'),
  ('recycle_margin_supplier_share',  '0')
ON CONFLICT (key) DO NOTHING;

-- ── ③ 廠商層級覆蓋（NULL＝照全站預設）──────────────────────
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS recycle_settlement_mode       text,
  ADD COLUMN IF NOT EXISTS recycle_margin_supplier_share numeric(5,2);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='suppliers_recycle_mode_check'
                   AND conrelid='public.suppliers'::regclass) THEN
    ALTER TABLE public.suppliers
      ADD CONSTRAINT suppliers_recycle_mode_check
      CHECK (recycle_settlement_mode IS NULL OR recycle_settlement_mode IN ('charge','margin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='suppliers_recycle_share_check'
                   AND conrelid='public.suppliers'::regclass) THEN
    ALTER TABLE public.suppliers
      ADD CONSTRAINT suppliers_recycle_share_check
      CHECK (recycle_margin_supplier_share IS NULL
             OR (recycle_margin_supplier_share >= 0 AND recycle_margin_supplier_share <= 100));
  END IF;
END $$;

COMMENT ON COLUMN public.suppliers.recycle_settlement_mode IS
  'charge＝跟廠商收回收價（抽獎照一般分潤）｜margin＝差額分潤（抽獎不走一般分潤）｜NULL＝照全站預設';
COMMENT ON COLUMN public.suppliers.recycle_margin_supplier_share IS
  'margin 模式下，差額分給廠商的百分比。0＝平台全拿。NULL＝照全站預設';

-- ── ④ 記帳時寫入單價／差額／觸發來源 ───────────────────────
-- p_trigger 帶預設值，前台既有的兩參數呼叫（p_record_ids / p_user_id）不受影響。
DROP FUNCTION IF EXISTS public.dismantle_prizes(bigint[], uuid);

CREATE OR REPLACE FUNCTION public.dismantle_prizes(
  p_record_ids bigint[],
  p_user_id    uuid,
  p_trigger    text DEFAULT 'manual'
) RETURNS TABLE (success_count integer, total_refund integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_record      RECORD;
  v_refund      INTEGER := 0;
  v_count       INTEGER := 0;
  v_prize_value INTEGER;
  v_trigger     TEXT := CASE WHEN p_trigger = 'expired' THEN 'expired' ELSE 'manual' END;
BEGIN
  FOR v_record IN
    SELECT dr.id, dr.product_prize_id, pp.total, p.price, p.type AS product_type
    FROM   public.draw_records   dr
    JOIN   public.product_prizes pp ON pp.id = dr.product_prize_id
    JOIN   public.products       p  ON p.id  = pp.product_id
    WHERE  dr.id      = ANY(p_record_ids)
      AND  dr.user_id = p_user_id
      AND  dr.status  = 'in_warehouse'
      AND  p.sale_mode <> 'lottery'
  LOOP
    v_prize_value := public.calc_recycle_value(
      v_record.product_type, v_record.price, v_record.total
    );

    UPDATE public.draw_records
    SET status = 'dismantled', refund_amount = v_prize_value
    WHERE id = v_record.id;

    IF v_record.product_type IN ('gacha', 'blindbox') AND v_record.product_prize_id IS NOT NULL THEN
      UPDATE public.product_prizes
      SET remaining = COALESCE(remaining, 0) + 1
      WHERE id = v_record.product_prize_id;
    END IF;

    INSERT INTO public.admin_recycle_pool (
      draw_record_id, user_id, product_id, product_prize_id,
      prize_name, prize_level, recycle_value,
      unit_price, margin, trigger
    )
    SELECT v_record.id, p_user_id, pp.product_id, pp.id,
           pp.name, pp.level, v_prize_value,
           v_record.price::integer,
           GREATEST(0, v_record.price::integer - v_prize_value),
           v_trigger
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
$$;

-- 逾期自動回收改帶 'expired'，報表才分得出強制與自願各佔多少
CREATE OR REPLACE FUNCTION public.auto_dismantle_expired_warehouse_items()
RETURNS TABLE (dismantled_count integer, total_tokens_refunded integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user   RECORD;
  v_result RECORD;
  v_count  INT := 0;
  v_tokens INT := 0;
BEGIN
  FOR v_user IN
    SELECT dr.user_id, array_agg(dr.id) AS record_ids
    FROM public.draw_records dr
    JOIN public.users    u ON u.id = dr.user_id
    JOIN public.products p ON p.id = dr.product_id
    LEFT JOIN LATERAL (
      SELECT max(t.created_at) AS traded_at
      FROM public.marketplace_transactions t
      WHERE t.draw_record_id = dr.id
    ) tx ON true
    WHERE dr.status = 'in_warehouse'
      AND (u.is_bot IS NULL OR u.is_bot = false)
      -- 抽籤販售有自己的逾期處理（expire_lottery_holds），別插手
      AND p.sale_mode IS DISTINCT FROM 'lottery'
      -- 預購從「可以出貨的那天」起算；買來的從「成交那天」起算。
      -- 兩個都取最大值，最晚的那個時間點才是這個人真正持有它的起點
      AND GREATEST(
            dr.created_at,
            COALESCE(p.preorder_available_at, dr.created_at),
            COALESCE(tx.traded_at, dr.created_at)
          ) < NOW() - INTERVAL '30 days'
    GROUP BY dr.user_id
  LOOP
    SELECT * INTO v_result
    FROM public.dismantle_prizes(v_user.record_ids, v_user.user_id, 'expired');

    v_count  := v_count  + COALESCE(v_result.success_count, 0);
    v_tokens := v_tokens + COALESCE(v_result.total_refund, 0);
  END LOOP;

  RETURN QUERY SELECT v_count, v_tokens;
END;
$$;

REVOKE ALL ON FUNCTION public.dismantle_prizes(bigint[], uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.dismantle_prizes(bigint[], uuid, text) TO authenticated, service_role;
