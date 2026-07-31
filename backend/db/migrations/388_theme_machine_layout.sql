-- 388_theme_machine_layout.sql
-- slot_themes 加 machine_layout（JSONB）：classic 機台各互動區域版位覆蓋（百分比）
-- 未設定的區域用元件內建預設（原主題座標）。範例：
-- {
--   "marquee":    {"l":24.93,"t":14.59,"w":50,"h":7.83},
--   "scoreboard": {"l":27.07,"t":27.15,"w":45.87,"h":8.8},
--   "reels":      {"t":40.77,"h":15.88,"cols":[{"l":22,"w":17.07},{"l":42.4,"w":16.13},{"l":61.73,"w":16.27}]},
--   "autoBtn":    {"l":21.87,"t":61.48,"w":17.33,"h":8.58},
--   "spinBtn":    {"l":39.2,"t":62.34,"w":23.73,"h":11.16},
--   "rushBtn":    {"l":62.93,"t":61.48,"w":17.33,"h":8.58}
-- }

ALTER TABLE public.slot_themes
  ADD COLUMN IF NOT EXISTS machine_layout JSONB;
