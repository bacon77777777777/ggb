-- 374_slot_theme_prizes_min_bet.sql
-- 主題獎池模板支援最低投注檔次（用於複製機台時對應 slot_pool_items.min_bet）

ALTER TABLE slot_theme_prizes ADD COLUMN IF NOT EXISTS min_bet INTEGER DEFAULT NULL;
COMMENT ON COLUMN slot_theme_prizes.min_bet IS '最低投注檔次（NULL = 所有檔次可得）';
