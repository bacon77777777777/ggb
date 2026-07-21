-- STG draw_records 補欄位同步（PROD 已有，STG 遺漏）
-- 已在 STG 手動套用（2026-07-21）

ALTER TABLE draw_records ADD COLUMN IF NOT EXISTS txid_seed text;
ALTER TABLE draw_records ADD COLUMN IF NOT EXISTS points_used integer NOT NULL DEFAULT 0;
