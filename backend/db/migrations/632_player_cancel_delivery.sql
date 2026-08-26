-- 632: 讓玩家自己取消還沒開單的配送申請（老闆 2026-08-26 問「你建議？」）
--
-- 建議開放，理由：
--  ① 最常見的取消原因是**地址填錯／選錯門市**。這種單如果不能取消，
--     出貨人員就會照著錯的地址寄出去 —— 那是一筆必然發生的退件：
--     運費賠掉、貨要再收回、玩家要客訴一輪。讓玩家在寄出前自己撤回，
--     比事後處理退件便宜得多。
--  ② `submitted` 階段平台零成本：沒開單、沒印、沒包，全額退代幣不虧。
--  ③ 省客服。試營運人力就那些，每一筆都要人工處理不合理。
--  ④ 沒有套利空間：退的就是當初扣的金額，反覆取消再申請對玩家沒有任何好處。
--
-- 界線：**只有「已提交且尚未開配送單」可以自己取消**。
-- 一旦託運單開出去（有 tracking_number），單子已經在綠界那邊，
-- 就不該讓玩家單方面取消 —— 那時要走客服，由後台判斷是否作廢託運單。

CREATE OR REPLACE FUNCTION public.cancel_my_delivery_order(p_order_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid   UUID := auth.uid();
  v_order orders%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  -- 鎖住再檢查：玩家按取消的同一刻，出貨人員可能正在按「開配送單」
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND OR v_order.user_id <> v_uid THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  IF v_order.status <> 'submitted' OR v_order.tracking_number IS NOT NULL THEN
    -- 已經開單／已在物流途中，這時候只能走客服
    RAISE EXCEPTION 'ALREADY_PROCESSING';
  END IF;

  -- 走跟後台同一支，退款與通知邏輯不另開一份
  RETURN public.cancel_delivery_order(p_order_id, 'admin', 'player:self');
END;
$function$;

COMMENT ON FUNCTION public.cancel_my_delivery_order(BIGINT) IS
  '玩家自行取消配送申請。只允許「已提交且尚未開配送單」，其餘一律擋下走客服。';

REVOKE ALL ON FUNCTION public.cancel_my_delivery_order(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_my_delivery_order(BIGINT) TO authenticated;
