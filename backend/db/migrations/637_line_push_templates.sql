-- 637：GB哥通知的「推播文字格式」（老闆 2026-08-28）
--
-- 後台設定頁每一列多一顆「編輯格式」，彈窗裡可以改這條推播長什麼樣。
-- template 是**外框**，`{{content}}` 會被換成 agent 當下產生的內容 ——
-- 這樣所有 cron route 都不用改，格式權完全交給老闆。
--
-- last_preview 存最近一次實際組出來的全文（含被開關擋掉沒送出的），
-- 彈窗直接拿它當預覽，不用另外編一份假資料。

CREATE TABLE IF NOT EXISTS line_push_templates (
  key            text PRIMARY KEY,
  template       text NOT NULL DEFAULT '{{content}}',
  last_preview   text,
  last_pushed_at timestamptz,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN line_push_templates.template IS '推播外框，{{content}} 會被換成 agent 產生的內容';
COMMENT ON COLUMN line_push_templates.last_preview IS '最近一次組出來的全文（含被開關擋掉的），供後台預覽';

INSERT INTO line_push_templates (key, template) VALUES
  ('line_push_daily', '{{content}}'),
  ('line_push_cfo', '{{content}}'),
  ('line_push_cmo', '{{content}}'),
  ('line_push_supply', '{{content}}'),
  ('line_push_health', '{{content}}'),
  ('line_push_market', '{{content}}'),
  ('line_push_risk', '{{content}}'),
  ('line_push_monitor', '{{content}}'),
  ('line_push_finance', '{{content}}'),
  ('line_push_deliver', '{{content}}'),
  ('line_push_dormant', '{{content}}'),
  ('line_push_recharge', '{{content}}'),
  ('line_push_content', '{{content}}'),
  ('line_push_cto', '{{content}}'),
  ('line_push_warehouse_dismantle', '{{content}}'),
  ('line_push_weekly', '{{content}}')
ON CONFLICT (key) DO NOTHING;

-- 這兩個開關從來沒建過資料列：linePush 的 isFlagEnabled 查不到會 fail open，
-- 所以它們一直是「開著、而且設定頁上看不到、關不掉」。補齊 16 個都能控制。
INSERT INTO feature_flags (key, enabled) VALUES
  ('line_push_weekly', false),
  ('line_push_warehouse_dismantle', false)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE line_push_templates ENABLE ROW LEVEL SECURITY;
-- 只有後台（service role）讀寫，前台不需要 → 不建 policy，service role 本來就繞過 RLS
