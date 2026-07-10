-- Migration 318: 客服工單表
-- 前台「聯絡我們」表單提交後寫入此表，後台客服管理頁面讀取

CREATE TABLE IF NOT EXISTS cs_tickets (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category      TEXT NOT NULL CHECK (category IN ('代幣問題', '抽獎問題', '商品問題', '出貨問題', '帳號問題', '其他')),
  email         TEXT NOT NULL,
  phone         TEXT NOT NULL,
  content       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  admin_note    TEXT,
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cs_tickets_user_id ON cs_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_cs_tickets_status ON cs_tickets(status);
CREATE INDEX IF NOT EXISTS idx_cs_tickets_created_at ON cs_tickets(created_at DESC);

-- RLS: 後台用 service_role 繞過，前台 API 也用 service_role 寫入
ALTER TABLE cs_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_full_access" ON cs_tickets
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE cs_tickets IS '前台客服工單，由聯絡我們表單提交，後台客服頁管理';
