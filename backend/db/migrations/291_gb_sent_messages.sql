-- Migration 291: 記錄 GB哥 發出的 LINE 訊息 ID
-- 目的：讓用戶用 LINE 「回覆」手勢針對 GB哥 的訊息回覆時，
--       不需要再喊 wake word，直接路由給 GB哥 並帶入對話記憶。
-- TTL：30 分鐘（查詢時用 cutoff 篩選，舊資料由 pg_cron 定期清除）

CREATE TABLE IF NOT EXISTS gb_sent_messages (
  id            bigserial   PRIMARY KEY,
  message_id    text        NOT NULL,   -- LINE 回傳的 sentMessages[].id
  line_user_id  text        NOT NULL,   -- 對話對象（userId 或 groupId）
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gb_sent_messages_msgid_idx
  ON gb_sent_messages(message_id);

CREATE INDEX IF NOT EXISTS gb_sent_messages_created_idx
  ON gb_sent_messages(created_at DESC);
