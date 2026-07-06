-- GB哥對話歷史：讓 GB哥 在 LINE 多輪對話中保持上下文
-- 每個 LINE user 保留最近 20 則訊息，超過 30 分鐘視為新對話

CREATE TABLE IF NOT EXISTS line_conversations (
  id          bigserial   PRIMARY KEY,
  line_user_id text        NOT NULL,
  role        text        NOT NULL CHECK (role IN ('user', 'assistant')),
  content     text        NOT NULL,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS line_conversations_user_time_idx
  ON line_conversations(line_user_id, created_at DESC);
