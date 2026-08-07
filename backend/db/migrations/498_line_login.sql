-- 498：LINE 登入
--
-- 玩家用 LINE 帳號登入前台。Supabase Auth 沒有 LINE provider，
-- 流程是自己搭的橋：LINE OAuth 拿 id_token → 後端驗證 → 查這張對照
-- → 有帳號就換出 session、沒有就建一個。
--
-- 只加一個欄位：LINE userId（U 開頭那串）→ 對到哪個玩家。
-- 唯一索引擋「同一個 LINE 帳號綁到兩個玩家」—— 那會讓後綁的人
-- 登入時拿到別人的帳號。

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS line_user_id text;

CREATE UNIQUE INDEX IF NOT EXISTS users_line_user_id_uniq
  ON public.users (line_user_id) WHERE line_user_id IS NOT NULL;

COMMENT ON COLUMN public.users.line_user_id IS
  'LINE 登入用的 LINE userId。NULL = 沒綁過 LINE。';
