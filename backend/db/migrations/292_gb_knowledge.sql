-- GB哥動態知識庫
-- GB哥透過 save_knowledge 工具自動存入，下次對話自動載入
CREATE TABLE IF NOT EXISTS gb_knowledge (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic       text NOT NULL,
  content     text NOT NULL,
  source      text NOT NULL DEFAULT 'auto', -- 'auto' | 'manual'
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gb_knowledge_updated_idx ON gb_knowledge(updated_at DESC);

-- service_role 可讀寫
ALTER TABLE gb_knowledge ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON gb_knowledge FOR ALL TO service_role USING (true) WITH CHECK (true);
