-- 抽獎模組設定：類別預設 + 商品個別覆蓋

CREATE TABLE IF NOT EXISTS module_settings (
  product_type TEXT PRIMARY KEY,
  machine_theme TEXT NOT NULL DEFAULT 'classic_capsule',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 預設值
INSERT INTO module_settings (product_type, machine_theme) VALUES
  ('gacha',   'classic_capsule'),
  ('ichiban', 'ichiban_pull'),
  ('blindbox','claw_machine'),
  ('card',    'card_pack'),
  ('custom',  'classic_capsule')
ON CONFLICT (product_type) DO NOTHING;

-- 商品個別覆蓋欄位（NULL = 跟隨類別預設）
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS machine_theme TEXT DEFAULT NULL;

-- RLS
ALTER TABLE module_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "module_settings public read"
  ON module_settings FOR SELECT USING (true);

CREATE POLICY "module_settings admin write"
  ON module_settings FOR ALL USING (true) WITH CHECK (true);
