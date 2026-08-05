-- 479: 抽籤販售逾期未領時，把籤號與庫存真的還回去
--
-- ── 問題 ──
-- expire_lottery_holds() 只把 draw_records.status 改成 'expired'，
-- 完全沒碰 product_prizes.remaining 也沒碰 products.remaining，
-- 而且籤號被 uq_draw_records_ticket 卡住，永遠不能再抽。
--
-- 也就是說：有人 0 元抽走一個品項、放著 30 天不申請，那個品項**永遠消失**。
-- 真實玩家再也抽不到，而抽走的人也沒拿到 —— 對誰都沒有好處。
--
-- 這讓「30 天保留期」變成純粹的懲罰機制：只把玩家的獎品刪掉，什麼都沒釋放。
-- 逾期機制存在的目的本來就是「還給別人」，不還就沒有意義。
--
-- ── 為什麼可以安全地釋放籤號 ──
-- 公平性驗證比對的是 build_seal_text(籤號 → 品項) 的雜湊，
-- 那份對照表在開賣前就封存了，跟誰抽走無關。
-- 籤 47 釋出後被別人重抽，拿到的還是同一個品項 —— 驗證照樣通過。
-- 反而更透明：揭曉後看得到「這張籤曾被抽走、逾期釋出、又被抽走」。
--
-- 落選（status='lost'）不釋放 —— 那是正當抽掉的，玩家已經得到結果了。

-- ── 1. 唯一索引排除已釋出的籤 ──
-- 原本只要有紀錄就佔住籤號，逾期的也算。改成逾期的不算，籤號才回得了池。
DROP INDEX IF EXISTS uq_draw_records_ticket;
CREATE UNIQUE INDEX uq_draw_records_ticket
  ON draw_records (product_id, ticket_number)
  WHERE is_ticketed AND ticket_number IS NOT NULL AND status <> 'expired';

COMMENT ON INDEX uq_draw_records_ticket IS
  '同一商品的同一籤號只能有一筆有效紀錄。逾期釋出（status=expired）的不算，籤號可被重抽 —— 封存的籤號→品項對照不變，驗證仍然成立。';

-- ── 2. 逾期時歸還庫存 ──
CREATE OR REPLACE FUNCTION public.expire_lottery_holds()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_n INTEGER;
BEGIN
  WITH expired AS (
    UPDATE draw_records dr
       SET status = 'expired'
     WHERE dr.status = 'in_warehouse'
       AND dr.expires_at IS NOT NULL
       AND dr.expires_at < now()
    RETURNING dr.id, dr.user_id, dr.prize_name, dr.product_id, dr.product_prize_id
  ),
  -- 品項庫存歸還。用 LEAST 夾住上限 —— 資料若曾被手動改過，
  -- 不加這道會把 remaining 加到超過 total
  restored_prize AS (
    UPDATE product_prizes pp
       SET remaining = LEAST(pp.total, pp.remaining + x.n)
      FROM (SELECT product_prize_id, count(*) n FROM expired
             WHERE product_prize_id IS NOT NULL GROUP BY 1) x
     WHERE pp.id = x.product_prize_id
    RETURNING 1
  ),
  -- 商品層的剩餘籤數也要還，否則前台顯示的「剩餘」會跟實際可抽的籤對不上
  restored_product AS (
    UPDATE products p
       SET remaining = LEAST(COALESCE(p.total_count, p.remaining + y.n), p.remaining + y.n)
      FROM (SELECT product_id, count(*) n FROM expired GROUP BY 1) y
     WHERE p.id = y.product_id
    RETURNING 1
  ),
  notified AS (
    INSERT INTO notifications (user_id, type, title, body, link)
    SELECT user_id, 'system', '抽籤商品保留期限已到',
           format('「%s」超過 30 天未申請寄送，已從倉庫移除，籤號釋出給其他玩家。', prize_name),
           '/profile?tab=warehouse'
    FROM expired
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_n FROM expired;
  RETURN COALESCE(v_n, 0);
END;
$function$;

COMMENT ON FUNCTION public.expire_lottery_holds IS
  '抽籤販售逾期未領：釋放籤號並歸還品項與商品庫存。不歸還的話逾期機制只是把玩家的獎品刪掉，對誰都沒好處。';

-- ── 3. 回補：既有已逾期但沒歸還的 ──
DO $$
DECLARE v_prize INT := 0; v_prod INT := 0;
BEGIN
  WITH x AS (
    SELECT product_prize_id, count(*) n FROM draw_records
     WHERE status = 'expired' AND product_prize_id IS NOT NULL GROUP BY 1
  )
  UPDATE product_prizes pp SET remaining = LEAST(pp.total, pp.remaining + x.n)
    FROM x WHERE pp.id = x.product_prize_id;
  GET DIAGNOSTICS v_prize = ROW_COUNT;

  WITH y AS (
    SELECT product_id, count(*) n FROM draw_records
     WHERE status = 'expired' GROUP BY 1
  )
  UPDATE products p SET remaining = LEAST(COALESCE(p.total_count, p.remaining + y.n), p.remaining + y.n)
    FROM y WHERE p.id = y.product_id;
  GET DIAGNOSTICS v_prod = ROW_COUNT;

  RAISE NOTICE '回補：品項 % 筆、商品 % 筆', v_prize, v_prod;
END $$;

SELECT '逾期紀錄' AS 項目, count(*)::text AS 值 FROM draw_records WHERE status = 'expired'
UNION ALL
SELECT '籤號唯一索引已排除逾期',
       (SELECT (indexdef ILIKE '%expired%')::text FROM pg_indexes WHERE indexname='uq_draw_records_ticket');
