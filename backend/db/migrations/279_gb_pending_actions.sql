-- GB哥二次確認操作暫存表（J意圖）
CREATE TABLE IF NOT EXISTS gb_pending_actions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id text        NOT NULL,
  tool_name    text        NOT NULL,
  tool_input   jsonb       NOT NULL,
  description  text        NOT NULL,
  created_at   timestamptz DEFAULT now(),
  expires_at   timestamptz DEFAULT (now() + interval '5 minutes')
);

CREATE INDEX IF NOT EXISTS gb_pending_actions_user_expires
  ON gb_pending_actions (line_user_id, expires_at);
