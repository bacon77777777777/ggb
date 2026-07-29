-- 369_slot_returns_4types.sql
-- 普通旋轉返還從 5 種改為 4 種，移除虛空試煉（0.05 倍）

BEGIN;

-- 刪除「虛空試煉」pool_items 及 prizes
DELETE FROM slot_pool_items
WHERE slot_prize_id IN (
  SELECT id FROM slot_prizes WHERE name = '虛空試煉'
);
DELETE FROM slot_prizes WHERE name = '虛空試煉';

-- 更新 slot_themes.spin_returns（移除 虛空試煉 項目）
UPDATE slot_themes
SET spin_returns = (
  SELECT jsonb_agg(elem)
  FROM jsonb_array_elements(spin_returns) elem
  WHERE elem->>'name' != '虛空試煉'
);

-- 更新 slot_machines.spin_returns（同步）
UPDATE slot_machines
SET spin_returns = (
  SELECT jsonb_agg(elem)
  FROM jsonb_array_elements(spin_returns) elem
  WHERE elem->>'name' != '虛空試煉'
)
WHERE spin_returns IS NOT NULL;

COMMIT;
