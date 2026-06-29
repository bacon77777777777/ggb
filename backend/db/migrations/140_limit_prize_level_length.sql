-- 1. Update known long values to shorter standard names
UPDATE product_prizes SET level = '一般' WHERE level = 'Normal / Common';
UPDATE product_prizes SET level = '稀有' WHERE level = 'Rare';
UPDATE product_prizes SET level = '隱藏' WHERE level = 'Secret';
UPDATE product_prizes SET level = '最後賞' WHERE level ILIKE 'Last One' OR level ILIKE 'LAST ONE';

-- 2. Truncate any other values that exceed 4 characters
-- This is a fallback to ensure constraint can be applied
UPDATE product_prizes 
SET level = LEFT(level, 4) 
WHERE char_length(level) > 4;

-- 3. Enforce max length of 4 characters for prize level
ALTER TABLE product_prizes
ADD CONSTRAINT product_prizes_level_length_check CHECK (char_length(level) <= 4);
