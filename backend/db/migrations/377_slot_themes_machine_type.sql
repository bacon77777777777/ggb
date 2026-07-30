-- 機台模組類型：video（影片帶入）或 classic（純機台效果，v15風格）
ALTER TABLE slot_themes
  ADD COLUMN IF NOT EXISTS machine_type TEXT NOT NULL DEFAULT 'video'
    CHECK (machine_type IN ('video', 'classic'));
