-- 568_register_feature_flag.sql
--
-- 「新帳號註冊」開關（功能開關頁 → 站台維護區）。
--
-- 登入頁是「登入即註冊」（signInWithOtp 自動開戶），這個旗標設為維護時
-- 只關掉自動開戶那一半：既有帳號照常登入，沒註冊過的信箱會被 Supabase 擋下。
--
-- 先把 row 種好：前台讀不到 row 時預設「開放」，但後台功能開關頁讀不到 row
-- 會顯示成關閉狀態 —— 兩邊會對不上，所以 row 一定要存在。

BEGIN;

INSERT INTO public.feature_flags (key, enabled, state)
VALUES ('register', true, 'on')
ON CONFLICT (key) DO NOTHING;

COMMIT;
