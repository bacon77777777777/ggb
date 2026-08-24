-- 616: 回收價「單一真相」—— 公式抽成一支函數，前台預覽與實際入帳共用
--
-- 為什麼：frontend/app/profile/page.tsx 有一行 `recycleValue = 10;`，
-- 把前面算好的值整個蓋掉，於是前台永遠顯示 10；但 DB 對 total<=3 的大賞
-- 其實給 price*20%（309 元的一番賞大賞給 61）。玩家看到的跟實際入帳的不是同一個數。
--
-- ⚠️ 這支 migration **不改任何價格**。calc_recycle_value 的內容是逐行照搬
-- dismantle_prizes 現有的 CASE（含 NULL 行為），行為零變化，只是從兩份變一份。
-- 之後要調比例，只要改 calc_recycle_value 一個地方，前台預覽會自動跟著對。

-- ── ① 規則本體（唯一一份）────────────────────────────────────
CREATE OR REPLACE FUNCTION public.calc_recycle_value(
  p_product_type    text,
  p_price           numeric,
  p_prize_total     integer,
  p_decompose_type  text,
  p_decompose_value integer
) RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    -- 轉蛋、盒玩：固定 10 代幣（回收後庫存歸還，可再售）
    WHEN p_product_type IN ('gacha', 'blindbox') THEN 10

    -- 商品層級手動設定 %
    WHEN p_decompose_type = 'percent' AND p_decompose_value IS NOT NULL
      THEN GREATEST(1, FLOOR(COALESCE(p_price, 0) * p_decompose_value / 100))::integer

    -- 商品層級手動設定固定代幣
    WHEN p_decompose_type = 'fixed' AND p_decompose_value IS NOT NULL
      THEN p_decompose_value

    -- auto：初始庫存 <= 3 視為大賞
    -- （不加 COALESCE —— 原本 plpgsql 的 `IF total <= 3` 遇到 NULL 會落到 ELSE，
    --   這裡的 CASE 對 NULL 同樣不匹配、同樣落到 ELSE，行為一致）
    WHEN p_prize_total <= 3
      THEN GREATEST(1, FLOOR(COALESCE(p_price, 0) * 0.2))::integer

    ELSE 10
  END;
$$;

COMMENT ON FUNCTION public.calc_recycle_value IS
  '回收價唯一規則來源。dismantle_prizes（實際入帳）與 estimate_recycle_value（前台預覽）都呼叫它，改比例只改這裡。';

-- ── ② 前台預覽用 RPC ─────────────────────────────────────────
-- 只回傳呼叫者自己的紀錄（auth.uid()），SECURITY DEFINER 是為了繞過
-- draw_records 的 RLS 也能一次撈完整 join，過濾條件已鎖死本人。
CREATE OR REPLACE FUNCTION public.estimate_recycle_value(p_record_ids bigint[])
RETURNS TABLE (
  draw_record_id bigint,
  recycle_value  integer,
  can_recycle    boolean,
  reason         text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    dr.id,
    public.calc_recycle_value(p.type, p.price, pp.total, pp.decompose_type, pp.decompose_value),
    -- 能不能收，條件跟 dismantle_prizes 的 WHERE 完全對齊
    (dr.status = 'in_warehouse' AND p.sale_mode <> 'lottery'),
    CASE
      WHEN p.sale_mode = 'lottery'      THEN 'lottery'
      WHEN dr.status <> 'in_warehouse'  THEN 'not_in_warehouse'
      ELSE NULL
    END
  FROM public.draw_records   dr
  JOIN public.product_prizes pp ON pp.id = dr.product_prize_id
  JOIN public.products       p  ON p.id  = pp.product_id
  WHERE dr.id = ANY(p_record_ids)
    AND dr.user_id = auth.uid();
$$;

COMMENT ON FUNCTION public.estimate_recycle_value IS
  '前台倉庫回收價預覽。回傳值保證等於 dismantle_prizes 實際入帳的金額（同一支 calc_recycle_value）。';

REVOKE ALL ON FUNCTION public.estimate_recycle_value(bigint[]) FROM public;
GRANT EXECUTE ON FUNCTION public.estimate_recycle_value(bigint[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calc_recycle_value(text, numeric, integer, text, integer) TO authenticated, service_role;

-- ── ③ 實際入帳改呼叫同一支函數 ───────────────────────────────
-- 原本的 IF/ELSIF 區塊整段換成一行 calc_recycle_value()，其餘（庫存歸還、
-- 回收池寫入、加幣）原封不動。
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
$$;
