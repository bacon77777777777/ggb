-- 602: 機器人預設頭像 /images/avatar/N.png → .webp（730KB → 45KB 一張）
--
-- 前台 public/images/avatar/01~08 轉成 WebP（老闆 2026-08-22 頁面加載優化）。
-- PROD 有 201 個機器人帳號的 avatar_url 指向 .png，排行榜／留言／小卡每次都在下載
-- 六七百 KB 的 PNG。一起換成 .webp；PNG 檔暫時留在 repo 當保險。
--
-- 堵漏：機器人是外部腳本建的（見 CLAUDE.md），之後若再塞 .png 進來，
-- BEFORE INSERT OR UPDATE 自動改成 .webp —— 不靠別人記得。

UPDATE public.users
SET avatar_url = regexp_replace(avatar_url, '^/images/avatar/(\d+)\.png$', '/images/avatar/\1.webp')
WHERE avatar_url ~ '^/images/avatar/\d+\.png$';

CREATE OR REPLACE FUNCTION public.users_avatar_webp_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.avatar_url ~ '^/images/avatar/\d+\.png$' THEN
    NEW.avatar_url := regexp_replace(NEW.avatar_url, '\.png$', '.webp');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_avatar_webp ON public.users;
CREATE TRIGGER trg_users_avatar_webp
  BEFORE INSERT OR UPDATE OF avatar_url ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.users_avatar_webp_trigger();
