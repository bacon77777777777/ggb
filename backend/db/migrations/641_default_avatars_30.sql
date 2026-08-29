-- 641：預設頭像從 8 款擴充到 30 款（老闆 2026-08-29）
--
-- migration 634 建的 random_default_avatar() 寫死抽 1~8。素材補到 30 款之後，
-- 新註冊的帳號仍然只會拿到前 8 款 —— 後面 22 款除非玩家自己去會員中心換，
-- 否則永遠不會出現。
--
-- 同一批要一起改的還有兩處（不在 DB）：
--   scripts/brand_sync.mjs 的 length: 30
--   frontend/app/profile/page.tsx 的 DEFAULT_AVATARS
--
-- 既有帳號不動：已經配到 01~08 的人不需要重配，那是他們的頭像。

CREATE OR REPLACE FUNCTION public.random_default_avatar()
RETURNS text
LANGUAGE sql
VOLATILE
AS $$
  SELECT '/images/avatar/' || lpad((floor(random() * 30) + 1)::int::text, 2, '0') || '.webp'
$$;

COMMENT ON FUNCTION public.random_default_avatar() IS
  '從 30 款預設頭像隨機挑一款，回傳前台可直接用的相對路徑（款數改動要同步 brand_sync.mjs 與 profile 的 DEFAULT_AVATARS）';
