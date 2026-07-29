-- 362: banners 表加 page 欄位，區分首頁/挑戰頁輪播圖
ALTER TABLE banners ADD COLUMN IF NOT EXISTS page TEXT NOT NULL DEFAULT 'home';

COMMENT ON COLUMN banners.page IS 'home=首頁輪播圖, challenge=挑戰頁輪播圖';
