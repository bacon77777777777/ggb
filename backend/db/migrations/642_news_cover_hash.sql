-- 642：news 加封面圖雜湊，用來擋「同一個商品、不同通路」的重複文章（2026-08-29）
--
-- 老闆回報情報頁「卡牌」分頁有兩篇看起來一樣的文章：
--   「寶可夢卡牌30周年紀念商品追加抽選！御三家9種套組同步開放」
--   「寶可夢卡牌30週年紀念商品 Yodobashi線上抽選販售」
-- 是 inside-games 的兩篇不同新聞（不同通路的抽選），但講的是同一批商品，
-- 用的**是同一張官方宣傳圖**（實測兩張 R2 成品 SHA-256 完全相同）。
--
-- 為什麼不能只靠標題相似度：實測那兩篇的標題相似度是 0.256，而
-- 「UNION ARENA Vol.3 新彈」vs「UNION ARENA 進階卡組」（不同商品、該留）
-- 反而是 0.442 —— **要擋的比要留的分數低**，設任何門檻都會誤傷。
-- 圖片雜湊是確定的訊號，不是機率的。
--
-- 存的是**來源原圖**的雜湊，不是轉存後的成品：成品經過縮圖與編碼，
-- 同一張來源圖在不同時間轉出來的位元組不保證一樣。

ALTER TABLE public.news ADD COLUMN IF NOT EXISTS cover_hash text;

COMMENT ON COLUMN public.news.cover_hash IS
  '封面來源原圖的 SHA-1，用於擋「同商品不同通路」的重複文章（news-agent 寫入時填）';

CREATE INDEX IF NOT EXISTS idx_news_cover_hash
  ON public.news (cover_hash) WHERE cover_hash IS NOT NULL;
