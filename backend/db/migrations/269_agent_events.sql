-- 跨部門事件匯流排：各 AI 單位偵測到跨部門事件時寫入此表
-- 需要人工處理的事件同時推播 LINE，並在後台「事件中心」顯示

CREATE TABLE IF NOT EXISTS agent_events (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type   text        NOT NULL,
  source_agent text        NOT NULL,
  payload      jsonb       DEFAULT '{}',
  status       text        DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'dismissed')),
  created_at   timestamptz DEFAULT now(),
  processed_at timestamptz,
  processed_by text
);

CREATE INDEX IF NOT EXISTS agent_events_status_idx
  ON agent_events(status) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS agent_events_type_idx
  ON agent_events(event_type);

CREATE INDEX IF NOT EXISTS agent_events_created_idx
  ON agent_events(created_at DESC);

COMMENT ON TABLE agent_events IS '跨部門 AI 事件匯流排。事件類型：category_suggestion / restock_needed / freeze_pending_payment / competitor_trending / revenue_anomaly / platform_incident';
