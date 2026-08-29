-- 644：news.is_manual —— 標記手動觸發那幾場寫進來的文章
--
-- 手動觸發（body 帶 limit）是拿來測新來源的，產量不照排程節奏走。
-- 但它寫進來的文章原本一起被算進分類的每日配額，等於把排程的額度吃光：
-- 2026-08-29 手動灌了 41 篇，隔天 02:00 那場一分類都滿了、一篇也寫不出來。
-- 老闆 2026-08-30：「不要算手動的，手動都是拿來測試新增的」。
-- 之後每日配額只算排程寫的（is_manual = false）。
ALTER TABLE news ADD COLUMN IF NOT EXISTS is_manual boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN news.is_manual IS '手動觸發 news-agent 寫入（測試用），不計入分類每日配額';
