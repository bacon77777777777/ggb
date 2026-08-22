-- 601: 拿掉 migration 153 的「小菜雞-xxxx」預設暱稱，統一成 email 前綴（老闆 2026-08-22 裁定）
--
-- 153 是早期的 public.users BEFORE INSERT 預設名；205 之後 auth 端的 handle_new_user
-- 已改成「metadata name → email 前綴」，600 又在 public.users 端用同一套規則補了保險
-- （trg_users_default_name）。153 那顆排在 600 前面先跑，STG 上空名會先變小菜雞、
-- PROD 則早已沒有這顆（不知何時掉的），兩環境不一致。拿掉後兩邊都走 email 前綴。
--
-- 執行時兩環境都沒有任何 '小菜雞-' 開頭的帳號；下面的 UPDATE 只是保險。

DROP TRIGGER IF EXISTS trg_set_default_user_name_small_chicken ON public.users;
DROP FUNCTION IF EXISTS public.set_default_user_name_small_chicken();

UPDATE public.users
SET name = public.default_user_name(email, NULL)
WHERE name ~ '^小菜雞-[0-9a-f]{4}$';
