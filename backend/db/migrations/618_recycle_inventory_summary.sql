-- 618: 回收品的「品項庫存」彙總 —— 廠商要包自製賞時看的那張表
--
-- 背景（老闆 2026-08-25）：
--   轉蛋／盒玩回收後 remaining +1 還回庫存，廠商實體沒動、會再被抽走。
--   一番賞／抽卡／自製賞是序列商品，還回庫存會破壞封存驗證與籤號順序，
--   所以實體留在平台手上 —— 這批要先統計起來，之後看廠商包成自製賞或自行處理。
--
-- ⚠️ 現況的坑：dismantle_prizes 是**不分類型全部**寫進 admin_recycle_pool，
--   但轉蛋／盒玩同時做了 remaining +1。所以池子裡 1,562 筆有 845 筆（54%）
--   是「已經還回庫存」的幽靈 —— 直接拿池子的數字給廠商看會錯一半。
--   下面的彙總函數預設把它們排除，要看才用 p_include_restocked。

-- ── ① 池表補 product_prize_id ────────────────────────────────
-- 原本只存 prize_name / prize_level 兩個字串，要彙總到「品項」只能靠字串比對
-- （同商品不同賞可能同名），或繞 draw_record_id 兩層 join。
-- 直接存一份，之後聚合只要一個 GROUP BY。
ALTER TABLE public.admin_recycle_pool
  ADD COLUMN IF NOT EXISTS product_prize_id bigint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admin_recycle_pool_product_prize_id_fkey'
      AND conrelid = 'public.admin_recycle_pool'::regclass
  ) THEN
    ALTER TABLE public.admin_recycle_pool
      ADD CONSTRAINT admin_recycle_pool_product_prize_id_fkey
      FOREIGN KEY (product_prize_id) REFERENCES public.product_prizes(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 回填：1,562 筆全部都對得回 draw_records.product_prize_id（已驗證）
UPDATE public.admin_recycle_pool arp
SET    product_prize_id = dr.product_prize_id
FROM   public.draw_records dr
WHERE  dr.id = arp.draw_record_id
  AND  arp.product_prize_id IS NULL
  AND  dr.product_prize_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_recycle_pool_prize
  ON public.admin_recycle_pool (product_prize_id, status);

COMMENT ON COLUMN public.admin_recycle_pool.product_prize_id IS
  '對應的品項。彙總「手上有幾件 X 商品的 Y 賞」用，見 recycle_inventory_summary()。';

-- ── ② 之後新回收的也要帶 product_prize_id ────────────────────
-- 只動 INSERT 那段多帶一個欄位，其餘與 migration 616 完全相同。
CREATE OR REPLACE FUNCTION public.dismantle_prizes(
  p_record_ids bigint[],
  p_user_id    uuid
) RETURNS TABLE (success_count integer, total_refund integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    -- 規則只有一份，見 calc_recycle_value（migration 616）
    v_prize_value := public.calc_recycle_value(
      v_record.product_type,
      v_record.price,
      v_record.total,
      v_record.decompose_type,
      v_record.decompose_value
    );

    -- 實際退還金額一併記錄，token_ledger 的「回收退還」讀這個
    UPDATE public.draw_records
    SET status = 'dismantled', refund_amount = v_prize_value
    WHERE id = v_record.id;

    -- 轉蛋/盒玩：回收後庫存歸還（廠商仍持有實物，可再次出貨）
    -- 一番賞/抽卡/自製賞為序列商品不加回，避免破壞抽獎順序與種子驗證
    IF v_record.product_type IN ('gacha', 'blindbox') AND v_record.product_prize_id IS NOT NULL THEN
      UPDATE public.product_prizes
      SET remaining = COALESCE(remaining, 0) + 1
      WHERE id = v_record.product_prize_id;
    END IF;

    INSERT INTO public.admin_recycle_pool (
      draw_record_id, user_id, product_id, product_prize_id, prize_name, prize_level, recycle_value
    )
    SELECT v_record.id, p_user_id, pp.product_id, pp.id, pp.name, pp.level, v_prize_value
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

-- ── ③ 品項庫存彙總 ───────────────────────────────────────────
-- 回答的是「這件商品的這個賞，平台手上還有幾件」。
-- 預設只算序列商品（一番賞／抽卡／自製賞）且 status='pending' ——
-- 轉蛋／盒玩已還回庫存不是實體庫存，已再利用／已報廢的也不該再算進可用數。
CREATE OR REPLACE FUNCTION public.recycle_inventory_summary(
  p_include_restocked boolean DEFAULT false,
  p_supplier_id       bigint  DEFAULT NULL
)
RETURNS TABLE (
  supplier_id        bigint,
  supplier_name      text,
  product_id         bigint,
  product_name       text,
  product_type       text,
  product_prize_id   bigint,
  prize_name         text,
  prize_level        text,
  unit_price         numeric,
  qty_pending        bigint,
  qty_reused         bigint,
  qty_scrapped       bigint,
  refund_cost        bigint,
  restocked          boolean,
  first_recycled_at  timestamptz,
  last_recycled_at   timestamptz
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    p.supplier_id::bigint,
    COALESCE(s.name, '—')::text,
    p.id::bigint,
    p.name::text,
    p.type::text,
    arp.product_prize_id::bigint,
    COALESCE(pp.name, arp.prize_name, '—')::text,
    COALESCE(pp.level, arp.prize_level, '—')::text,
    p.price,
    COUNT(*) FILTER (WHERE arp.status = 'pending'),
    COUNT(*) FILTER (WHERE arp.status = 'reused'),
    COUNT(*) FILTER (WHERE arp.status = 'scrapped'),
    -- 平台為了收回這些實體付出去的退幣，廠商談處置時的成本基準
    COALESCE(SUM(arp.recycle_value) FILTER (WHERE arp.status = 'pending'), 0)::bigint,
    (p.type IN ('gacha', 'blindbox')),
    MIN(arp.created_at),
    MAX(arp.created_at)
  FROM public.admin_recycle_pool arp
  JOIN public.products       p  ON p.id  = arp.product_id
  LEFT JOIN public.product_prizes pp ON pp.id = arp.product_prize_id
  LEFT JOIN public.suppliers s  ON s.id  = p.supplier_id
  LEFT JOIN public.users     u  ON u.id  = arp.user_id
  WHERE (u.is_bot IS NULL OR u.is_bot = false)
    -- 轉蛋／盒玩回收後已 remaining +1 還回庫存，不是平台實體庫存，預設不列
    AND (p_include_restocked OR p.type NOT IN ('gacha', 'blindbox'))
    AND (p_supplier_id IS NULL OR p.supplier_id = p_supplier_id)
  GROUP BY p.supplier_id, s.name, p.id, p.name, p.type,
           arp.product_prize_id, pp.name, pp.level, arp.prize_name, arp.prize_level, p.price
  ORDER BY COUNT(*) FILTER (WHERE arp.status = 'pending') DESC, p.name, 8;
$$;

COMMENT ON FUNCTION public.recycle_inventory_summary IS
  '回收品實體庫存彙總（後台「回收池 → 品項庫存」）。預設排除轉蛋／盒玩 —— 那些回收後已還回庫存，不在平台手上。';

GRANT EXECUTE ON FUNCTION public.recycle_inventory_summary(boolean, bigint) TO service_role;
