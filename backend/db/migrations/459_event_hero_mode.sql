-- 459: 活動頁的首屏（hero）可以獨立設定深淺
--
-- 原本 hero 不管 theme_mode 是什麼都固定深色：
--
--   // Hero is ALWAYS dark regardless of theme (cinematic section)
--   const heroBg = isDark ? 'transparent' : '#0a0610'
--
-- 當初是為了電影感，但後果是管理員把風格切成「淺色」按下儲存後，
-- 最上面那一大塊主視覺還是黑的 —— 看起來像沒生效，實際上有存進去。
-- 老闆就是這樣連按了兩次儲存。
--
-- 改成獨立欄位而不是直接跟著 theme_mode：
-- 「內容淺色但首屏維持深色」本來就是個合理的組合，不該被綁死。
--
-- 預設 'dark' 是刻意的：既有活動頁的視覺一個字都不會變。

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS hero_mode TEXT NOT NULL DEFAULT 'dark';

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_hero_mode_check;
ALTER TABLE public.events ADD CONSTRAINT events_hero_mode_check
  CHECK (hero_mode IN ('dark', 'light', 'follow'));

COMMENT ON COLUMN public.events.hero_mode IS
  '首屏配色：dark 固定深色（預設，維持既有視覺）／light 固定淺色／follow 跟隨 theme_mode';
