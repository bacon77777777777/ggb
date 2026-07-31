-- 368_slot_prize_type.sql
-- 為 slot_prizes 加入 prize_type 欄位（'rush' | 'coin_return'）

ALTER TABLE slot_prizes ADD COLUMN IF NOT EXISTS prize_type TEXT NOT NULL DEFAULT 'rush';

-- 依 slot_pool_items 的 coin_return 自動設定現有記錄
UPDATE slot_prizes sp
SET prize_type = 'coin_return'
WHERE EXISTS (
  SELECT 1 FROM slot_pool_items spi
  WHERE spi.slot_prize_id = sp.id AND spi.coin_return = true
);
