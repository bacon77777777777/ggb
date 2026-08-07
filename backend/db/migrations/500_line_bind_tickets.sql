-- 500：LINE 綁定既有帳號 —— 票表擴充
--
-- 玩家用 Email 註冊過、後來按 LINE 登入，會開出一個全新的空帳號 ——
-- G 幣和倉庫都在舊帳號，看起來像不見了。解法是「綁定」：登入原帳號後
-- 把 LINE 綁上去，之後 LINE 登入直接進原帳號。
--
-- 偽 app 的綁定跟登入一樣要跨情境接力（授權回程落在 Safari），
-- 所以票表加一個 kind：
--   login —— 原本的登入票，token_hash 是一次性登入權
--   bind  —— 綁定票，只存「這個 LINE 是誰」（sub／名字／頭像）。
--             實際綁定發生在偽 app 帶著自己的 session 來取票的那一刻，
--             Safari 端沒有 session，不能也不必在那裡動帳號

ALTER TABLE public.line_login_tickets
  ADD COLUMN IF NOT EXISTS kind         text NOT NULL DEFAULT 'login',
  ADD COLUMN IF NOT EXISTS line_sub     text,
  ADD COLUMN IF NOT EXISTS line_name    text,
  ADD COLUMN IF NOT EXISTS line_picture text;
