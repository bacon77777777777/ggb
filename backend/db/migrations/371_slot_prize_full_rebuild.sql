-- 371_slot_prize_full_rebuild.sql
-- 重新設計 RUSH 獎池：使用所有 23 張圖、品項數按檔次梯度
--   100G=3件, 300G=5件, 500G=6件, 1000G=8件, 2000G=10件
-- 更新普通旋轉返還 multiplier → 2.4/1.5/0.8/0.5
--   E[coin/bet] ≈ 0.80，搭配 RUSH 2.7× 期望值 → 目標 RTP ≈ 85%

BEGIN;

-- ===== 清除舊 RUSH 獎池 =====
DELETE FROM slot_pool_items WHERE rush_only = true;
DELETE FROM slot_prizes WHERE prize_type = 'rush';

-- ===== 更新普通旋轉返還 multiplier =====
UPDATE slot_pool_items SET return_multiplier = 2.4
WHERE coin_return = true AND slot_prize_id IN (SELECT id FROM slot_prizes WHERE name = '神域共鳴');

UPDATE slot_pool_items SET return_multiplier = 1.5
WHERE coin_return = true AND slot_prize_id IN (SELECT id FROM slot_prizes WHERE name = '命運之瞳');

UPDATE slot_pool_items SET return_multiplier = 0.8
WHERE coin_return = true AND slot_prize_id IN (SELECT id FROM slot_prizes WHERE name = '緋色幸運');

UPDATE slot_pool_items SET return_multiplier = 0.5
WHERE coin_return = true AND slot_prize_id IN (SELECT id FROM slot_prizes WHERE name = '黃金序章');

-- 同步 JSONB
UPDATE slot_themes SET spin_returns = '[
  {"name":"神域共鳴", "weight":50,  "multiplier":2.4},
  {"name":"命運之瞳", "weight":100, "multiplier":1.5},
  {"name":"緋色幸運", "weight":200, "multiplier":0.8},
  {"name":"黃金序章", "weight":500, "multiplier":0.5}
]'::jsonb WHERE spin_returns IS NOT NULL;

UPDATE slot_machines SET spin_returns = '[
  {"name":"神域共鳴", "weight":50,  "multiplier":2.4},
  {"name":"命運之瞳", "weight":100, "multiplier":1.5},
  {"name":"緋色幸運", "weight":200, "multiplier":0.8},
  {"name":"黃金序章", "weight":500, "multiplier":0.5}
]'::jsonb WHERE spin_returns IS NOT NULL;

-- ===== 重建 RUSH 品項 =====
DO $$
DECLARE
  v_machine RECORD;
  v_prize_id BIGINT;
  i INT;

  -- 100G 3件：200-430G（2~4.3×）
  t100_names   TEXT[]    := ARRAY['角色徽章收藏組','限定角色貼紙集','角色明信片組（限定）'];
  t100_images  TEXT[]    := ARRAY['/images/slot/00001.png','/images/slot/00002.png','/images/slot/00003.png'];
  t100_values  INT[]     := ARRAY[200, 300, 430];
  t100_weights INT[]     := ARRAY[500, 280, 120];

  -- 300G 5件：600-1350G（2~4.5×）
  t300_names   TEXT[]    := ARRAY['角色 A4 海報組','碎片收藏徽章包','限定角色帆布袋','角色壓克力吊飾','場景壓克力擺飾'];
  t300_images  TEXT[]    := ARRAY['/images/slot/00004.png','/images/slot/10002.webp','/images/slot/10003.webp','/images/slot/10005.webp','/images/slot/10008.webp'];
  t300_values  INT[]     := ARRAY[600, 780, 960, 1120, 1350];
  t300_weights INT[]     := ARRAY[500, 350, 220, 120, 60];

  -- 500G 6件：1050-2500G（2.1~5×）
  t500_names   TEXT[]    := ARRAY['角色特大壓克力板','限定帆布購物袋','角色精工鑰匙圈組','雙面壓克力立牌','限定帆布托特包','限定藝術卡冊'];
  t500_images  TEXT[]    := ARRAY['/images/slot/10012.webp','/images/slot/10014.jpg','/images/slot/10015.webp','/images/slot/10018.webp','/images/slot/10024.webp','/images/slot/10025.webp'];
  t500_values  INT[]     := ARRAY[1050, 1350, 1600, 1900, 2150, 2500];
  t500_weights INT[]     := ARRAY[500,  350,  200,  120,  60,   25];

  -- 1000G 8件：2100-5500G（2.1~5.5×）
  t1000_names   TEXT[]   := ARRAY['角色典藏版拼圖','大型壓克力立牌','限定精品禮盒','角色布偶公仔','限定絨毛公仔豪華版','典藏版金屬胸章組','限定簽名海報組','頂級典藏套組'];
  t1000_images  TEXT[]   := ARRAY['/images/slot/10027.webp','/images/slot/10028.webp','/images/slot/10029.webp','/images/slot/10030.webp','/images/slot/10031.webp','/images/slot/10032.webp','/images/slot/10033.webp','/images/slot/10034.webp'];
  t1000_values  INT[]    := ARRAY[2100, 2700, 3200, 3600, 4000, 4400, 4800, 5500];
  t1000_weights INT[]    := ARRAY[500,  350,  200,  120,  70,   40,   20,   8];

  -- 2000G 10件：4200-13000G（2.1~6.5×）
  t2000_names   TEXT[]   := ARRAY['限定コレクションBOX','角色典藏特大拼圖','超大型壓克力立牌','角色聯名豪華帆布袋','頂級角色壓克力擺飾','限定聯名周邊套組','超大型布偶公仔','豪華角色典藏箱','超限量收藏典藏組','頂級限定典藏禮盒'];
  t2000_images  TEXT[]   := ARRAY['/images/slot/10036.webp','/images/slot/00001.png','/images/slot/00002.png','/images/slot/00003.png','/images/slot/00004.png','/images/slot/10002.webp','/images/slot/10003.webp','/images/slot/10005.webp','/images/slot/10008.webp','/images/slot/10012.webp'];
  t2000_values  INT[]    := ARRAY[4200, 4800, 5600, 6400, 7200, 8000, 8800, 9600, 11000, 13000];
  t2000_weights INT[]    := ARRAY[500,  380,  250,  150,  85,   45,   22,   10,   4,     1];

BEGIN
  FOR v_machine IN SELECT id FROM slot_machines WHERE is_active = true LOOP

    FOR i IN 1..3 LOOP
      INSERT INTO slot_prizes (name, level, image_url, recycle_value, prize_type, is_active)
      VALUES (t100_names[i], 'normal', t100_images[i], t100_values[i], 'rush', true)
      RETURNING id INTO v_prize_id;
      INSERT INTO slot_pool_items (machine_id, slot_prize_id, weight, rush_only, coin_return, min_bet)
      VALUES (v_machine.id, v_prize_id, t100_weights[i], true, false, 100);
    END LOOP;

    FOR i IN 1..5 LOOP
      INSERT INTO slot_prizes (name, level, image_url, recycle_value, prize_type, is_active)
      VALUES (t300_names[i], 'normal', t300_images[i], t300_values[i], 'rush', true)
      RETURNING id INTO v_prize_id;
      INSERT INTO slot_pool_items (machine_id, slot_prize_id, weight, rush_only, coin_return, min_bet)
      VALUES (v_machine.id, v_prize_id, t300_weights[i], true, false, 300);
    END LOOP;

    FOR i IN 1..6 LOOP
      INSERT INTO slot_prizes (name, level, image_url, recycle_value, prize_type, is_active)
      VALUES (t500_names[i], 'normal', t500_images[i], t500_values[i], 'rush', true)
      RETURNING id INTO v_prize_id;
      INSERT INTO slot_pool_items (machine_id, slot_prize_id, weight, rush_only, coin_return, min_bet)
      VALUES (v_machine.id, v_prize_id, t500_weights[i], true, false, 500);
    END LOOP;

    FOR i IN 1..8 LOOP
      INSERT INTO slot_prizes (name, level, image_url, recycle_value, prize_type, is_active)
      VALUES (t1000_names[i], 'normal', t1000_images[i], t1000_values[i], 'rush', true)
      RETURNING id INTO v_prize_id;
      INSERT INTO slot_pool_items (machine_id, slot_prize_id, weight, rush_only, coin_return, min_bet)
      VALUES (v_machine.id, v_prize_id, t1000_weights[i], true, false, 1000);
    END LOOP;

    FOR i IN 1..10 LOOP
      INSERT INTO slot_prizes (name, level, image_url, recycle_value, prize_type, is_active)
      VALUES (t2000_names[i], 'normal', t2000_images[i], t2000_values[i], 'rush', true)
      RETURNING id INTO v_prize_id;
      INSERT INTO slot_pool_items (machine_id, slot_prize_id, weight, rush_only, coin_return, min_bet)
      VALUES (v_machine.id, v_prize_id, t2000_weights[i], true, false, 2000);
    END LOOP;

  END LOOP;
END;
$$;

COMMIT;
