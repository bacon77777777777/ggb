-- 367_slot_prize_per_tier.sql
-- 每個檔次有獨立的 RUSH 品項、不同圖片、固定回收價值（不隨檔次縮放）
-- 圖片分 5 組（各 4 張），名稱分 5 組，價值窄區間（約 2~4.5 倍押注）

BEGIN;

-- 清空舊資料
TRUNCATE slot_sessions, slot_pool_items CASCADE;
DELETE FROM slot_prizes WHERE level = 'normal';

DO $$
DECLARE
  v_machine RECORD;
  v_prize_id BIGINT;
  i INT;

  -- 每個檔次 4 件：(name, image, recycle_value, weight, min_bet)
  -- 100G 檔次品項：回收 200~450G（2~4.5 倍）
  t100_names   TEXT[]    := ARRAY['碎片收藏徽章包','角色明信片組（限定）','限定插畫貼紙集','角色壓克力板（小）'];
  t100_images  TEXT[]    := ARRAY['/images/slot/10002.webp','/images/slot/10003.webp','/images/slot/10005.webp','/images/slot/10008.webp'];
  t100_values  INT[]     := ARRAY[200, 280, 350, 450];
  t100_weights INT[]     := ARRAY[500, 350, 220, 130];

  -- 300G 檔次品項：回收 600~1350G（2~4.5 倍）
  t300_names   TEXT[]    := ARRAY['角色 A4 海報組','角色徽章套組（豪華）','限定帆布購物袋','場景壓克力擺飾'];
  t300_images  TEXT[]    := ARRAY['/images/slot/10012.webp','/images/slot/10014.jpg','/images/slot/10015.webp','/images/slot/10018.webp'];
  t300_values  INT[]     := ARRAY[600, 840, 1050, 1350];
  t300_weights INT[]     := ARRAY[500, 350, 220, 130];

  -- 500G 檔次品項：回收 1000~2250G（2~4.5 倍）
  t500_names   TEXT[]    := ARRAY['限定帆布托特包','雙面壓克力立牌','角色精工鑰匙圈組','限定藝術卡冊'];
  t500_images  TEXT[]    := ARRAY['/images/slot/10024.webp','/images/slot/10025.webp','/images/slot/10027.webp','/images/slot/10028.webp'];
  t500_values  INT[]     := ARRAY[1000, 1400, 1750, 2250];
  t500_weights INT[]     := ARRAY[500, 350, 220, 130];

  -- 1000G 檔次品項：回收 2000~4500G（2~4.5 倍）
  t1000_names   TEXT[]   := ARRAY['大型壓克力立牌','限定精品禮盒','角色典藏版拼圖','限定絨毛公仔'];
  t1000_images  TEXT[]   := ARRAY['/images/slot/10029.webp','/images/slot/10030.webp','/images/slot/10031.webp','/images/slot/10032.webp'];
  t1000_values  INT[]    := ARRAY[2000, 2800, 3500, 4500];
  t1000_weights INT[]    := ARRAY[500, 350, 220, 130];

  -- 2000G 檔次品項：回收 4000~9000G（2~4.5 倍）
  t2000_names   TEXT[]   := ARRAY['限定コレクションBOX','超大型壓克力立牌','典藏版金屬胸章組','限定聯名周邊套組'];
  t2000_images  TEXT[]   := ARRAY['/images/slot/10033.webp','/images/slot/10034.webp','/images/slot/10036.webp','/images/slot/10002.webp'];
  t2000_values  INT[]    := ARRAY[4000, 5600, 7000, 9000];
  t2000_weights INT[]    := ARRAY[500, 350, 220, 130];

  -- 普通旋轉返還（coin_return，隨檔次縮放）
  ret_names     TEXT[]    := ARRAY['神域共鳴','命運之瞳','緋色幸運','黃金序章','虛空試煉'];
  ret_mults     NUMERIC[] := ARRAY[5, 3, 2, 1.3, 0.05];
  ret_weights   INT[]     := ARRAY[50, 100, 200, 500, 1150];
BEGIN
  FOR v_machine IN SELECT id FROM slot_machines WHERE is_active = true LOOP

    -- 普通旋轉返還（無 min_bet）
    FOR i IN 1..array_length(ret_names, 1) LOOP
      INSERT INTO slot_prizes (name, level, image_url, recycle_value, is_active)
      VALUES (ret_names[i], 'normal', '/images/slot/coin.png', 0, true)
      RETURNING id INTO v_prize_id;

      INSERT INTO slot_pool_items (machine_id, slot_prize_id, weight, rush_only, coin_return, return_multiplier, display_name)
      VALUES (v_machine.id, v_prize_id, ret_weights[i], false, true, ret_mults[i], ret_names[i]);
    END LOOP;

    -- 100G 檔次 RUSH 品項
    FOR i IN 1..4 LOOP
      INSERT INTO slot_prizes (name, level, image_url, recycle_value, is_active)
      VALUES (t100_names[i], 'normal', t100_images[i], t100_values[i], true)
      RETURNING id INTO v_prize_id;
      INSERT INTO slot_pool_items (machine_id, slot_prize_id, weight, rush_only, coin_return, min_bet)
      VALUES (v_machine.id, v_prize_id, t100_weights[i], true, false, 100);
    END LOOP;

    -- 300G 檔次 RUSH 品項
    FOR i IN 1..4 LOOP
      INSERT INTO slot_prizes (name, level, image_url, recycle_value, is_active)
      VALUES (t300_names[i], 'normal', t300_images[i], t300_values[i], true)
      RETURNING id INTO v_prize_id;
      INSERT INTO slot_pool_items (machine_id, slot_prize_id, weight, rush_only, coin_return, min_bet)
      VALUES (v_machine.id, v_prize_id, t300_weights[i], true, false, 300);
    END LOOP;

    -- 500G 檔次 RUSH 品項
    FOR i IN 1..4 LOOP
      INSERT INTO slot_prizes (name, level, image_url, recycle_value, is_active)
      VALUES (t500_names[i], 'normal', t500_images[i], t500_values[i], true)
      RETURNING id INTO v_prize_id;
      INSERT INTO slot_pool_items (machine_id, slot_prize_id, weight, rush_only, coin_return, min_bet)
      VALUES (v_machine.id, v_prize_id, t500_weights[i], true, false, 500);
    END LOOP;

    -- 1000G 檔次 RUSH 品項
    FOR i IN 1..4 LOOP
      INSERT INTO slot_prizes (name, level, image_url, recycle_value, is_active)
      VALUES (t1000_names[i], 'normal', t1000_images[i], t1000_values[i], true)
      RETURNING id INTO v_prize_id;
      INSERT INTO slot_pool_items (machine_id, slot_prize_id, weight, rush_only, coin_return, min_bet)
      VALUES (v_machine.id, v_prize_id, t1000_weights[i], true, false, 1000);
    END LOOP;

    -- 2000G 檔次 RUSH 品項
    FOR i IN 1..4 LOOP
      INSERT INTO slot_prizes (name, level, image_url, recycle_value, is_active)
      VALUES (t2000_names[i], 'normal', t2000_images[i], t2000_values[i], true)
      RETURNING id INTO v_prize_id;
      INSERT INTO slot_pool_items (machine_id, slot_prize_id, weight, rush_only, coin_return, min_bet)
      VALUES (v_machine.id, v_prize_id, t2000_weights[i], true, false, 2000);
    END LOOP;

  END LOOP;
END;
$$;

COMMIT;
