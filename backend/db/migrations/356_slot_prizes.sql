-- 挑戰機台獨立品項表（與 product_prizes 解耦，避免種子驗證衝突）
CREATE TABLE IF NOT EXISTS slot_prizes (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'normal' CHECK (level IN ('normal', 'rare', 'super_rare', 'ultra_rare')),
  image_url TEXT,
  description TEXT,
  remaining INTEGER, -- NULL = 無限
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 讓 slot_pool_items 支援兩種來源：舊的 product_prize_id 或新的 slot_prize_id
ALTER TABLE slot_pool_items
  ALTER COLUMN product_prize_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS slot_prize_id BIGINT REFERENCES slot_prizes(id) ON DELETE CASCADE;

-- 確保每列至少有一個來源
ALTER TABLE slot_pool_items
  ADD CONSTRAINT slot_pool_items_prize_source_check
  CHECK (product_prize_id IS NOT NULL OR slot_prize_id IS NOT NULL);

-- 啟用 RLS（前台不直接存取此表，後台用 service_role 繞過）
ALTER TABLE slot_prizes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON slot_prizes FOR ALL USING (true);

COMMENT ON TABLE slot_prizes IS '挑戰機台專用品項，獨立於 product_prizes，避免種子驗證衝突';
