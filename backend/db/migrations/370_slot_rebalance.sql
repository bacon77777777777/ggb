-- 370_slot_rebalance.sql
-- 1. 修正普通旋轉返還 multiplier：由 5/3/2/1.3 改為 0.5/0.3/0.2/0.13（部分返還，不超過押注）
-- 2. 調整 RUSH 獎池品項數量：100G=2件, 300G=3件, 500G=4件, 1000G=6件, 2000G=8件

BEGIN;

-- ===== 1. 修正 coin_return multiplier =====

UPDATE slot_pool_items SET return_multiplier = 0.5
WHERE coin_return = true
  AND slot_prize_id IN (SELECT id FROM slot_prizes WHERE name = '神域共鳴');

UPDATE slot_pool_items SET return_multiplier = 0.3
WHERE coin_return = true
  AND slot_prize_id IN (SELECT id FROM slot_prizes WHERE name = '命運之瞳');

UPDATE slot_pool_items SET return_multiplier = 0.2
WHERE coin_return = true
  AND slot_prize_id IN (SELECT id FROM slot_prizes WHERE name = '緋色幸運');

UPDATE slot_pool_items SET return_multiplier = 0.13
WHERE coin_return = true
  AND slot_prize_id IN (SELECT id FROM slot_prizes WHERE name = '黃金序章');

-- 同步 slot_themes.spin_returns
UPDATE slot_themes
SET spin_returns = '[
  {"name": "神域共鳴",  "weight": 50,  "multiplier": 0.5},
  {"name": "命運之瞳",  "weight": 100, "multiplier": 0.3},
  {"name": "緋色幸運",  "weight": 200, "multiplier": 0.2},
  {"name": "黃金序章",  "weight": 500, "multiplier": 0.13}
]'::jsonb
WHERE spin_returns IS NOT NULL;

-- 同步 slot_machines.spin_returns
UPDATE slot_machines
SET spin_returns = '[
  {"name": "神域共鳴",  "weight": 50,  "multiplier": 0.5},
  {"name": "命運之瞳",  "weight": 100, "multiplier": 0.3},
  {"name": "緋色幸運",  "weight": 200, "multiplier": 0.2},
  {"name": "黃金序章",  "weight": 500, "multiplier": 0.13}
]'::jsonb
WHERE spin_returns IS NOT NULL;

-- ===== 2. 100G 只保留 2 件（移除較貴的 2 件）=====

DELETE FROM slot_pool_items
WHERE min_bet = 100 AND rush_only = true
  AND slot_prize_id IN (
    SELECT id FROM slot_prizes WHERE name IN ('限定插畫貼紙集', '角色壓克力板（小）')
  );
DELETE FROM slot_prizes WHERE name IN ('限定插畫貼紙集', '角色壓克力板（小）');

-- ===== 3. 300G 只保留 3 件（移除最貴的 1 件）=====

DELETE FROM slot_pool_items
WHERE min_bet = 300 AND rush_only = true
  AND slot_prize_id IN (
    SELECT id FROM slot_prizes WHERE name = '場景壓克力擺飾'
  );
DELETE FROM slot_prizes WHERE name = '場景壓克力擺飾';

-- ===== 4. 1000G 新增 2 件（共 6 件，5000～6500G）=====

DO $$
DECLARE
  v_machine RECORD;
  v_prize_id BIGINT;
  names   TEXT[]  := ARRAY['限定布偶公仔豪華版',     '角色典藏鋼製徽章組'];
  images  TEXT[]  := ARRAY['/images/slot/10005.webp', '/images/slot/10008.webp'];
  vals    INT[]   := ARRAY[5500, 6500];
  wgts    INT[]   := ARRAY[80,   40];
  i INT;
BEGIN
  FOR v_machine IN SELECT id FROM slot_machines WHERE is_active = true LOOP
    FOR i IN 1..2 LOOP
      INSERT INTO slot_prizes (name, level, image_url, recycle_value, is_active)
      VALUES (names[i], 'normal', images[i], vals[i], true)
      RETURNING id INTO v_prize_id;

      INSERT INTO slot_pool_items (machine_id, slot_prize_id, weight, rush_only, coin_return, min_bet)
      VALUES (v_machine.id, v_prize_id, wgts[i], true, false, 1000);
    END LOOP;
  END LOOP;
END;
$$;

-- ===== 5. 2000G 新增 4 件（共 8 件，加入 4500/6500/8500/12000G 區間）=====

DO $$
DECLARE
  v_machine RECORD;
  v_prize_id BIGINT;
  names   TEXT[]  := ARRAY['角色典藏版特大拼圖',     '限定簽名海報組',         '超大型場景壓克力立牌',   '頂級限定典藏禮盒'];
  images  TEXT[]  := ARRAY['/images/slot/10015.webp', '/images/slot/10024.webp', '/images/slot/10027.webp', '/images/slot/10031.webp'];
  vals    INT[]   := ARRAY[4500, 6500, 8500, 12000];
  wgts    INT[]   := ARRAY[250,  100,  50,   15];
  i INT;
BEGIN
  FOR v_machine IN SELECT id FROM slot_machines WHERE is_active = true LOOP
    FOR i IN 1..4 LOOP
      INSERT INTO slot_prizes (name, level, image_url, recycle_value, is_active)
      VALUES (names[i], 'normal', images[i], vals[i], true)
      RETURNING id INTO v_prize_id;

      INSERT INTO slot_pool_items (machine_id, slot_prize_id, weight, rush_only, coin_return, min_bet)
      VALUES (v_machine.id, v_prize_id, wgts[i], true, false, 2000);
    END LOOP;
  END LOOP;
END;
$$;

COMMIT;
