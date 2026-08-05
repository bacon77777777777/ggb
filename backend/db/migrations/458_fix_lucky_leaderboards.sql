-- 458: 幸運／非酋排行榜從來沒能執行過
--
--   JOIN product_prizes pp ON d.prize_id = pp.id
--                             ^^^^^^^^^^
-- draw_records 沒有 prize_id 這個欄位，正確名稱是 product_prize_id。
-- 兩支函數都是同一個錯，一呼叫就 42703（column does not exist）。
--
-- 一直沒被發現，是因為前台在資料不足時本來就會顯示空清單，
-- 錯誤被吞在呼叫端 —— 看起來只像「還沒有人上榜」。
-- 補了機器人假數據之後跑起來才炸出來。
--
-- ── 為什麼用動態改寫而不是貼一份新定義 ──
-- 兩環境的回傳欄位不一致（把 PROD 的定義套到 STG 會得到
-- 「cannot change return type of existing function」）。
-- 這裡只做一件事：把各環境自己那份定義裡的錯誤欄位名換掉，
-- 其餘一個字都不動，就不會把環境差異一起帶過去。

DO $$
DECLARE
  r   RECORD;
  def TEXT;
  n   INT := 0;
BEGIN
  FOR r IN
    SELECT oid, proname FROM pg_proc
    WHERE proname IN ('get_leaderboard_lucky', 'get_leaderboard_unlucky')
      AND pronamespace = 'public'::regnamespace
  LOOP
    def := pg_get_functiondef(r.oid);
    IF def LIKE '%d.prize_id%' THEN
      EXECUTE replace(def, 'd.prize_id', 'd.product_prize_id');
      n := n + 1;
      RAISE NOTICE '已修正 %', r.proname;
    END IF;
  END LOOP;
  RAISE NOTICE '共修正 % 支', n;
END $$;
