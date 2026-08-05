-- 441: 抽籤販售的三個後果 —— 不可分解、寄出時付款、30 天到期
--
-- 中籤品項是 0 元抽來的，所以：
--   1. 不可分解。可以分解的話等於沒付錢就換到 G 幣，整個模式立刻被套利。
--   2. 申請寄出時才付該品項的販售金額（product_prizes.sale_price），
--      這筆金額與運費分開計算、分開入帳。
--   3. 30 天內沒申請寄出就失效。0 元抽的不退幣，只是保留期限到了。

BEGIN;

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

    UPDATE public.draw_records SET status = 'dismantled' WHERE id = v_record.id;

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
$function$

;

-- ── 申請寄出時收取中籤品項的販售金額 ────────────────────────────────────
-- 與運費分開：運費是平台代墊的物流成本，販售金額是商品本身的價金，
-- 對帳時要看得出來哪筆是哪筆，所以 token_adjustments 分兩筆寫。
CREATE OR REPLACE FUNCTION public.lottery_purchase_total(
  p_user_id UUID, p_draw_record_ids BIGINT[]
) RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(pp.sale_price), 0)::INTEGER
  FROM draw_records dr
  JOIN products       p  ON p.id  = dr.product_id
  JOIN product_prizes pp ON pp.id = dr.product_prize_id
  WHERE dr.id = ANY(p_draw_record_ids)
    AND dr.user_id = p_user_id
    AND dr.status  = 'in_warehouse'
    AND p.sale_mode = 'lottery';
$$;

COMMENT ON FUNCTION public.lottery_purchase_total IS
  '這批品項裡屬於抽籤販售的，中籤後應付的價金合計。前台用於顯示，實際扣款以 create_delivery_order 為準。';

-- ── 到期清除 ────────────────────────────────────────────────────────────
-- 只清還在倉庫、沒進到出貨流程的。已經申請寄出的不受影響。
CREATE OR REPLACE FUNCTION public.expire_lottery_holds()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE v_n INTEGER;
BEGIN
  WITH expired AS (
    UPDATE draw_records dr
       SET status = 'expired'
     WHERE dr.status = 'in_warehouse'
       AND dr.expires_at IS NOT NULL
       AND dr.expires_at < now()
    RETURNING dr.id, dr.user_id, dr.prize_name
  ),
  notified AS (
    INSERT INTO notifications (user_id, type, title, body, link)
    SELECT user_id, 'system', '抽籤商品保留期限已到',
           format('「%s」超過 30 天未申請寄送，已從倉庫移除。', prize_name),
           '/profile?tab=warehouse'
    FROM expired
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_n FROM expired;
  RETURN COALESCE(v_n, 0);
END;
$$;

COMMENT ON FUNCTION public.expire_lottery_holds IS
  '清除逾期未申請寄送的抽籤中籤品項。0 元抽來的，逾期不退幣。';

COMMIT;
