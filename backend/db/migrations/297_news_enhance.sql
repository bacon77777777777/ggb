-- news 表擴充：圖片、來源、分類、刊登日期
ALTER TABLE news ADD COLUMN IF NOT EXISTS image_url    TEXT;
ALTER TABLE news ADD COLUMN IF NOT EXISTS source_url   TEXT;
ALTER TABLE news ADD COLUMN IF NOT EXISTS category     TEXT DEFAULT 'general';
ALTER TABLE news ADD COLUMN IF NOT EXISTS summary      TEXT;
ALTER TABLE news ADD COLUMN IF NOT EXISTS tags         TEXT[];

-- 防止同一來源重複寫入
CREATE UNIQUE INDEX IF NOT EXISTS news_source_url_idx ON news (source_url)
  WHERE source_url IS NOT NULL;

NOTIFY pgrst, 'reload schema';
