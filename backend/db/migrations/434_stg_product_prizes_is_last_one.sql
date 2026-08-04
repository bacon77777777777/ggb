-- 434: 補齊 STG 缺少的 product_prizes.is_last_one
--
-- 兩環境結構漂移：這個欄位 PROD 有、STG 沒有。
-- play_ichiban 的最後賞判定會讀它：
--
--   SELECT * FROM product_prizes
--   WHERE product_id = p_product_id AND level IN ('Last One','LAST ONE','最後賞')
--      OR (product_id = p_product_id AND is_last_one = TRUE)
--
-- 所以 STG 上只要有最後賞的一番賞抽到最後一張，整筆交易就會
-- 「column is_last_one does not exist」失敗 —— 而且是在扣完款之後才炸，
-- 玩家會看到抽獎失敗但代幣已經沒了（同一交易會 rollback，但錯誤訊息毫無意義）。
--
-- 平常不會遇到是因為沒人在 STG 把一檔真的抽完。壓測一定會抽完。

ALTER TABLE public.product_prizes
  ADD COLUMN IF NOT EXISTS is_last_one BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.product_prizes.is_last_one IS
  '標記為最後賞。與 level IN (Last One / LAST ONE / 最後賞) 是二擇一的判定方式。';

-- 既有資料照 level 補標，讓兩種判定方式一致
UPDATE public.product_prizes
   SET is_last_one = TRUE
 WHERE level IN ('Last One', 'LAST ONE', '最後賞')
   AND COALESCE(is_last_one, FALSE) = FALSE;
