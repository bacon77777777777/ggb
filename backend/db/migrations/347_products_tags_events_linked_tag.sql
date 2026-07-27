-- 商品 tags（活動分類用）+ 活動 linked_tag
ALTER TABLE products ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
ALTER TABLE events ADD COLUMN IF NOT EXISTS linked_tag text;

-- Index for tag filtering
CREATE INDEX IF NOT EXISTS idx_products_tags ON products USING GIN(tags);
