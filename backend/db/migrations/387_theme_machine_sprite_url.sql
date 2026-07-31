-- 387_theme_machine_sprite_url.sql
-- slot_themes 加機台組圖欄位：classic 機台的 sprite 組圖（2048×1400 固定模板）
-- 未設定時前台使用預設 /images/slot/machine/sprite.png

ALTER TABLE public.slot_themes
  ADD COLUMN IF NOT EXISTS machine_sprite_url TEXT;
