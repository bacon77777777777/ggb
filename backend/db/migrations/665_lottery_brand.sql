-- 665: 抽籤販售檔期加「品牌」
--
-- 老闆 2026-08-31：前台列表的分類頁籤本來是照檔期狀態分（全部／登記中／即將開始／
-- 待開獎／已開獎），改成照**品牌**分（寶可夢、遊戲王、NBA…）。
--
-- 為什麼狀態不適合當頁籤：玩家逛的時候想的是「有沒有寶可夢的」，不是
-- 「有沒有待開獎的」。而且狀態會自己隨時間變，同一檔今天在這個頁籤、明天跳到另一個，
-- 逛到一半東西就不見了。
--
-- 不另外開一張品牌表：品牌就是一個字串，後台新建檔期時從「已經打過的」下拉挑，
-- 或直接輸入新的。開一張表就要多一個維護頁，而這裡沒有任何欄位需要跟著品牌走。

ALTER TABLE public.lottery_events
  ADD COLUMN IF NOT EXISTS brand text;

COMMENT ON COLUMN public.lottery_events.brand IS
  '品牌／IP（寶可夢、遊戲王、NBA…）。前台列表的分類頁籤照這欄分組；空值歸在「其他」。';

-- 前台列表會用它分組
CREATE INDEX IF NOT EXISTS idx_lottery_events_brand
  ON public.lottery_events (brand) WHERE status = 'published';
