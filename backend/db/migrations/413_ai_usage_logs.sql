-- 413: AI 用量記錄
--
-- 目的：各 AI 單位（news-agent、CFO/CMO/CTO、GB哥、客服…）呼叫 Claude 的
-- token 用量原本回應裡就有，卻被丟掉。存下來才能回答「一天/一個月花多少」，
-- 不必再用推算。記錄本身零成本 —— 只是把已經拿到的數字寫進 DB。
--
-- 費率隨模型不同，故存 token 原始值，金額於查詢時換算，模型換價不必回頭改資料。

CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
  id            BIGSERIAL PRIMARY KEY,
  agent         TEXT NOT NULL,              -- news-agent / gb-bro / cfo-agent …
  model         TEXT,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_usage_logs IS
  'Claude 呼叫的 token 用量。純記錄，不影響任何業務邏輯；寫入失敗不可中斷主流程。';

CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON public.ai_usage_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_agent_time ON public.ai_usage_logs (agent, created_at DESC);

-- 前台角色無需存取
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_usage_logs FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.ai_usage_logs_id_seq FROM anon, authenticated;
