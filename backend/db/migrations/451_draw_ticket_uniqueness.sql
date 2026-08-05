-- 451: 籤號唯一性改由索引保證（解 PRODUCT_BUSY 的前置）
--
-- 現在「同一張籤不會被兩個人拿走」完全靠 play_ichiban 裡的
--   IF EXISTS (SELECT 1 FROM draw_records WHERE product_id=X AND ticket_number=ANY(...))
-- 這是典型的 check-then-insert：兩個交易同時查都查不到，就會雙雙插入。
-- 目前之所以沒出事，是因為外層用 pg_try_advisory_xact_lock 把整個商品鎖死，
-- 同商品同時只有一個人能抽 —— 拿不到鎖的直接收到 PRODUCT_BUSY。
--
-- 要把鎖從「拒絕」改成「排隊」，就不能再讓正確性只靠那把鎖。
-- 先讓資料庫自己保證籤號唯一，鎖才降級得下去。
--
-- ── 為什麼需要 is_ticketed 這個欄位 ──
-- 不能直接對 (product_id, ticket_number) 建唯一索引：轉蛋的 ticket_number
-- 只是個 nonce，沒有「籤」的語意，PROD 上就有 8329 筆同商品重複；機台則是 NULL。
-- 索引述詞又沒辦法參照 products.type，所以在 draw_records 上補一個旗標，
-- 由走籤號的抽獎函數自己標記。
--
-- 述詞另外排除 ticket_number IS NULL：STG 有 27 筆早期測試資料籤號是空的，
-- 而唯一索引本來就把 NULL 視為互不相同，不排除只是讓預檢查誤判。

ALTER TABLE public.draw_records
  ADD COLUMN IF NOT EXISTS is_ticketed BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.draw_records.is_ticketed IS
  '這筆的 ticket_number 是真的籤號（一番賞／抽卡／自製賞），不是轉蛋那種 nonce。唯一索引只看這些。';

-- 既有資料：走籤號引擎的三種類型補標記
UPDATE public.draw_records d
   SET is_ticketed = TRUE
  FROM public.products p
 WHERE p.id = d.product_id
   AND p.type IN ('ichiban', 'card', 'custom')
   AND d.is_ticketed = FALSE;

-- 建立前先確認沒有既有衝突，有的話寧可整支失敗也不要靜默跳過
DO $$
DECLARE v_dup INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_dup FROM (
    SELECT product_id, ticket_number FROM public.draw_records
    WHERE is_ticketed AND ticket_number IS NOT NULL
    GROUP BY 1, 2 HAVING COUNT(*) > 1
  ) x;
  IF v_dup > 0 THEN
    RAISE EXCEPTION '既有資料有 % 組重複籤號，無法建立唯一索引', v_dup;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_draw_records_ticket
  ON public.draw_records (product_id, ticket_number)
  WHERE is_ticketed AND ticket_number IS NOT NULL;

COMMENT ON INDEX public.uq_draw_records_ticket IS
  '同一商品的同一籤號只能被抽走一次。取代原本靠 advisory lock 保證的正確性。';
