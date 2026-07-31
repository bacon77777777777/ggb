-- Migration 361: Machine themes + seed 3 machines per theme

-- 1. Add machine_theme column
ALTER TABLE slot_machines
  ADD COLUMN IF NOT EXISTS machine_theme TEXT NOT NULL DEFAULT '絕頂RUSH';

-- 2. Set existing machine's theme
UPDATE slot_machines SET machine_theme = '絕頂RUSH' WHERE id = 1;

-- 3. Add 2 more machines to have 3 total in "絕頂RUSH" theme
INSERT INTO slot_machines (
  name, description, machine_theme,
  price_per_spin, trigger_rate, continue_rate,
  min_rush_hits, floor_spin_count, is_active, sort_order,
  bet_tiers, guaranteed_prize
) VALUES
(
  '絕頂RUSH',
  '80%超高繼續率・突破保底解放大獎',
  '絕頂RUSH',
  100,
  0.15, 0.80,
  3, 30,
  true, 2,
  '[{"coins": 100, "label": "小注"}, {"coins": 500, "label": "中注"}, {"coins": 1000, "label": "大注"}]',
  true
),
(
  '絕頂RUSH',
  '80%超高繼續率・突破保底解放大獎',
  '絕頂RUSH',
  100,
  0.15, 0.80,
  3, 30,
  true, 3,
  '[{"coins": 100, "label": "小注"}, {"coins": 500, "label": "中注"}, {"coins": 1000, "label": "大注"}]',
  true
);

-- 4. Also update machine #1's name to match theme
UPDATE slot_machines SET
  name = '絕頂RUSH',
  description = '80%超高繼續率・突破保底解放大獎',
  sort_order = 1
WHERE id = 1;
