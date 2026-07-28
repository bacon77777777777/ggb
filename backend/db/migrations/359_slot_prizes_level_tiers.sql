-- 挑戰機台稀有度改為等獎制
ALTER TABLE slot_prizes
  DROP CONSTRAINT IF EXISTS slot_prizes_level_check;

ALTER TABLE slot_prizes
  ADD CONSTRAINT slot_prizes_level_check
  CHECK (level IN ('一等獎','二等獎','三等獎','四等獎','五等獎','六等獎','七等獎','八等獎'));

-- 舊資料轉換
UPDATE slot_prizes SET level = '一等獎' WHERE level IN ('ultra_rare');
UPDATE slot_prizes SET level = '二等獎' WHERE level IN ('super_rare');
UPDATE slot_prizes SET level = '三等獎' WHERE level IN ('rare');
UPDATE slot_prizes SET level = '八等獎' WHERE level IN ('normal');
