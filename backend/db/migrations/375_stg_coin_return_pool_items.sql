-- 補 STG 挑戰機台 coin_return 品項
-- PROD 在 migration 371 時已建立；STG 漏掉這 4 筆 slot_prizes + 每台機台的 pool_items

-- 1. 補 slot_prizes（coin_return 類型）
INSERT INTO slot_prizes (name, prize_type, level, image_url, is_active, recycle_value)
VALUES
  ('神域共鳴', 'coin_return', 'normal', '/images/slot/coin.png', true, 0),
  ('命運之瞳', 'coin_return', 'normal', '/images/slot/coin.png', true, 0),
  ('緋色幸運', 'coin_return', 'normal', '/images/slot/coin.png', true, 0),
  ('黃金序章', 'coin_return', 'normal', '/images/slot/coin.png', true, 0)
ON CONFLICT DO NOTHING;

-- 2. 補每台機台的 coin_return pool items
DO $$
DECLARE
  mid INT;
  sp_shenyuGM INT;
  sp_mingyun INT;
  sp_feise INT;
  sp_huangjin INT;
BEGIN
  SELECT id INTO sp_shenyuGM FROM slot_prizes WHERE name = '神域共鳴' AND prize_type = 'coin_return' LIMIT 1;
  SELECT id INTO sp_mingyun  FROM slot_prizes WHERE name = '命運之瞳'  AND prize_type = 'coin_return' LIMIT 1;
  SELECT id INTO sp_feise    FROM slot_prizes WHERE name = '緋色幸運'  AND prize_type = 'coin_return' LIMIT 1;
  SELECT id INTO sp_huangjin FROM slot_prizes WHERE name = '黃金序章'  AND prize_type = 'coin_return' LIMIT 1;

  FOR mid IN SELECT id FROM slot_machines ORDER BY id LOOP
    -- Skip if already has coin_return items for this machine
    IF NOT EXISTS (SELECT 1 FROM slot_pool_items WHERE machine_id = mid AND coin_return = true) THEN
      INSERT INTO slot_pool_items
        (machine_id, slot_prize_id, display_name, coin_return, rush_only, normal_only, is_floor, return_multiplier, weight)
      VALUES
        (mid, sp_shenyuGM, '神域共鳴', true, false, false, false, 2.4,  50),
        (mid, sp_mingyun,  '命運之瞳', true, false, false, false, 1.5, 100),
        (mid, sp_feise,    '緋色幸運', true, false, false, false, 0.8, 200),
        (mid, sp_huangjin, '黃金序章', true, false, false, false, 0.25, 520);
    END IF;
  END LOOP;
END $$;
