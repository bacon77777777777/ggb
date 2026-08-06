-- 484：修好倉庫逾期自動分解，並排上排程
--
-- 條款、常見問題、退換貨三個頁面都寫著「30 天後自動換回代幣」，
-- 但這件事從來沒有真的發生過 —— 函數存在，pg_cron 裡卻沒有對應的 job。
-- 而且就算排了也會立刻炸掉，因為那支函數本身是壞的：
--
--   1. 讀 dr.prize_price、寫 dr.updated_at，draw_records 兩個欄位都沒有（42703）
--   2. 退款金額直接取那個不存在的欄位，完全沒照 dismantle_prizes 的算法
--      （轉蛋盒玩固定 10、percent、fixed、auto 依初始庫存）
--   3. 沒有把轉蛋／盒玩的庫存加回去
--   4. 沒有排除抽籤販售 —— 那是 0 元抽來的，分解等於沒付錢就換到代幣
--   5. 額外寫一筆 token_adjustments。token_ledger 已經從 draw_records 的
--      dismantled 狀態認列這筆退款了，再寫一次會變成重複入帳
--
-- 與其把那五件事一條一條補進來（然後手動分解改了規則這裡又忘記跟），
-- 直接呼叫 dismantle_prizes。分解的規則從此只有一份。

CREATE OR REPLACE FUNCTION public.auto_dismantle_expired_warehouse_items()
RETURNS TABLE(dismantled_count integer, total_tokens_refunded integer)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user   RECORD;
  v_result RECORD;
  v_count  INT := 0;
  v_tokens INT := 0;
BEGIN
  -- dismantle_prizes 一次只吃一個使用者，所以先按使用者分組
  FOR v_user IN
    SELECT dr.user_id, array_agg(dr.id) AS record_ids
    FROM public.draw_records dr
    JOIN public.users    u ON u.id = dr.user_id
    JOIN public.products p ON p.id = dr.product_id
    WHERE dr.status = 'in_warehouse'
      AND (u.is_bot IS NULL OR u.is_bot = false)
      -- 抽籤販售有自己的逾期處理（expire_lottery_holds），別插手
      AND p.sale_mode IS DISTINCT FROM 'lottery'
      -- 預購品從「可以出貨的那天」起算，不是從抽到的那天。
      -- 否則預購開賣前就抽的人，商品一到貨就立刻被分解掉
      AND GREATEST(dr.created_at, COALESCE(p.preorder_available_at, dr.created_at))
          < NOW() - INTERVAL '30 days'
    GROUP BY dr.user_id
  LOOP
    SELECT * INTO v_result
    FROM public.dismantle_prizes(v_user.record_ids, v_user.user_id);

    v_count  := v_count  + COALESCE(v_result.success_count, 0);
    v_tokens := v_tokens + COALESCE(v_result.total_refund, 0);
  END LOOP;

  RETURN QUERY SELECT v_count, v_tokens;
END;
$$;

COMMENT ON FUNCTION public.auto_dismantle_expired_warehouse_items() IS
  '倉庫逾期 30 天自動分解。退款算法一律走 dismantle_prizes，不另外實作一份。';

-- 每天台灣時間 05:00（UTC 21:00）跑一次。
-- 避開 04:00 的 lottery-expire-daily，兩支都在動 draw_records。
--
-- 包在條件裡是因為 STG 沒有裝 pg_cron。不擋的話這個 migration 在 STG
-- 會在最後兩行報錯，函數雖然已經建好了，但看起來像整支失敗
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.unschedule('warehouse-auto-dismantle')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'warehouse-auto-dismantle');

    PERFORM cron.schedule(
      'warehouse-auto-dismantle',
      '0 21 * * *',
      'SELECT public.auto_dismantle_expired_warehouse_items()'
    );
  ELSE
    RAISE NOTICE '這個環境沒有 pg_cron，只建函數不排程';
  END IF;
END
$do$;
