
-- 1. 建立或更新 news 資料表
CREATE TABLE IF NOT EXISTS news (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    view_count INTEGER DEFAULT 0
);

-- 2. 確保欄位存在 (針對既有資料表)
DO $$
BEGIN
    BEGIN
        ALTER TABLE news ADD COLUMN is_active BOOLEAN DEFAULT true;
    EXCEPTION
        WHEN duplicate_column THEN NULL;
    END;

    BEGIN
        ALTER TABLE news ADD COLUMN content TEXT;
    EXCEPTION
        WHEN duplicate_column THEN NULL;
    END;

    BEGIN
        ALTER TABLE news ADD COLUMN view_count INTEGER DEFAULT 0;
    EXCEPTION
        WHEN duplicate_column THEN NULL;
    END;
END $$;

-- 3. 設定 RLS (參照 Banners 策略，允許公開讀寫以支援目前的 Admin 實作)
ALTER TABLE news ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all users" ON news;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON news;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON news;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON news;
DROP POLICY IF EXISTS "Allow public read access" ON news;
DROP POLICY IF EXISTS "Allow public insert access" ON news;
DROP POLICY IF EXISTS "Allow public update access" ON news;
DROP POLICY IF EXISTS "Allow public delete access" ON news;

CREATE POLICY "Allow public read access" ON news FOR SELECT USING (true);
CREATE POLICY "Allow public insert access" ON news FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access" ON news FOR UPDATE USING (true);
CREATE POLICY "Allow public delete access" ON news FOR DELETE USING (true);

-- 4. 重新載入 Schema
NOTIFY pgrst, 'reload schema';
