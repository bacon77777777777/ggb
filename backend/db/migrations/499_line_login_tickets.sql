-- 499：LINE 登入的跨情境取票
--
-- iOS 的偽 app（加入主畫面的 PWA）跳去 LINE app 授權後，回程只會落在
-- Safari，回不到偽 app（PWA 沒有接網址的資格，這是平台限制）。
-- 兩邊儲存空間隔離，登入態沒辦法用瀏覽器端的任何機制帶回去 ——
-- 所以走伺服器：Safari 端完成驗證後把「登入票」存進這張表，
-- 偽 app 輪詢取票，在自己的情境裡完成登入。門市選擇的
-- cvs-pending 已經用同一招，實測可行。
--
-- state_hash 存的是 SHA-256：票（token_hash）本身等於一次性登入權，
-- 這張表若被讀走，沒有原始 state 也換不到票。

CREATE TABLE IF NOT EXISTS public.line_login_tickets (
  state_hash  text        PRIMARY KEY,
  token_hash  text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.line_login_tickets IS
  'LINE 登入的一次性取票（偽 app 輪詢用）。取走即刪，5 分鐘過期。';

-- 只有 service role 能碰。前台 API 都走 service role，anon 完全不該看到
ALTER TABLE public.line_login_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.line_login_tickets FROM anon, authenticated;
