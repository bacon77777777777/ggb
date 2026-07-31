-- 364_reset_slot_seed.sql
-- 清空現有 slot 假資料，建立新主題「絕頂RUSH」5 台機 + 5 檔次 + 6 個 RUSH 獎池品項 + 5 個返還符號

BEGIN;

-- ── 移除舊 level check constraint（新系統不用等獎分級）────────────────────────
ALTER TABLE slot_prizes DROP CONSTRAINT IF EXISTS slot_prizes_level_check;

-- ── 清空 ──────────────────────────────────────────────────────────────────────
TRUNCATE slot_sessions, slot_pool_items, slot_machines, slot_theme_prizes CASCADE;
DELETE FROM slot_prizes;
DELETE FROM slot_themes;

-- ── 建立主題 ──────────────────────────────────────────────────────────────────
INSERT INTO slot_themes (
  name, machine_count, supplier_id, image_url,
  bet_tiers, trigger_rate, continue_rate, min_rush_hits, floor_spin_count,
  spin_returns, is_active, sort_order
) VALUES (
  '絕頂RUSH', 5, 2, '/images/slot/header.png',
  '[{"coins":100},{"coins":300},{"coins":500},{"coins":1000},{"coins":2000}]'::jsonb,
  0.15, 0.60, 3, 30,
  '[
    {"name":"神域共鳴","multiplier":5,"weight":50},
    {"name":"命運之瞳","multiplier":3,"weight":100},
    {"name":"緋色幸運","multiplier":2,"weight":200},
    {"name":"黃金序章","multiplier":1.3,"weight":500},
    {"name":"虛空試煉","multiplier":0.05,"weight":1150}
  ]'::jsonb,
  true, 1
);

-- ── 建立 RUSH 獎池模板 + 機台 ────────────────────────────────────────────────
DO $$
DECLARE
  v_theme_id   BIGINT;
  v_machine_id BIGINT;
  v_prize_id   BIGINT;
  v_tp         RECORD;
  i            INT;

  -- RUSH 獎池模板 (name, image, weight, video_type, stock)
  rush_names    TEXT[]    := ARRAY['限定帆布托特包','壓克力立牌（大）','角色 A4 海報組','角色徽章套組','限定明信片組','隨機貼紙包'];
  rush_images   TEXT[]    := ARRAY['/images/slot/10002.webp','/images/slot/10003.webp','/images/slot/10005.webp','/images/slot/10008.webp','/images/slot/10012.webp','/images/slot/10015.webp'];
  rush_weights  INT[]     := ARRAY[80, 150, 250, 350, 500, 700];
  rush_vtypes   TEXT[]    := ARRAY['win_god','win_strong','win','win','win','win'];
  rush_stocks   INT[]     := ARRAY[2, 3, 5, 5, 8, 10];

  -- 普通旋轉返還 (name, multiplier, weight)
  ret_names     TEXT[]    := ARRAY['神域共鳴','命運之瞳','緋色幸運','黃金序章','虛空試煉'];
  ret_mults     NUMERIC[] := ARRAY[5, 3, 2, 1.3, 0.05];
  ret_weights   INT[]     := ARRAY[50, 100, 200, 500, 1150];
BEGIN
  SELECT id INTO v_theme_id FROM slot_themes WHERE name = '絕頂RUSH' LIMIT 1;

  -- ── 建立 slot_theme_prizes 模板 ─────────────────────────────────────────────
  FOR i IN 1..array_length(rush_names, 1) LOOP
    INSERT INTO slot_theme_prizes (theme_id, name, image_url, weight, video_type, per_machine_stock, sort_order, is_active)
    VALUES (v_theme_id, rush_names[i], rush_images[i], rush_weights[i], rush_vtypes[i], rush_stocks[i], i, true);
  END LOOP;

  -- ── 建立 5 台機台 ────────────────────────────────────────────────────────────
  FOR i IN 1..5 LOOP
    INSERT INTO slot_machines (
      name, machine_theme, event_slug, supplier_id, image_url,
      price_per_spin, bet_tiers,
      trigger_rate, continue_rate, min_rush_hits, floor_spin_count,
      theme_id, machine_number, spin_returns,
      is_active, sort_order
    ) VALUES (
      '絕頂RUSH', 'slot', 'zetcho', 2, '/images/slot/item.png',
      100,
      '[{"coins":100},{"coins":300},{"coins":500},{"coins":1000},{"coins":2000}]'::jsonb,
      0.15, 0.60, 3, 30,
      v_theme_id, i,
      '[
        {"name":"神域共鳴","multiplier":5,"weight":50},
        {"name":"命運之瞳","multiplier":3,"weight":100},
        {"name":"緋色幸運","multiplier":2,"weight":200},
        {"name":"黃金序章","multiplier":1.3,"weight":500},
        {"name":"虛空試煉","multiplier":0.05,"weight":1150}
      ]'::jsonb,
      true, i
    ) RETURNING id INTO v_machine_id;

    -- 5 個普通旋轉返還品項（coin_return）
    FOR j IN 1..array_length(ret_names, 1) LOOP
      INSERT INTO slot_prizes (name, level, image_url, is_active)
      VALUES (ret_names[j], 'normal', '/images/slot/coin.png', true)
      RETURNING id INTO v_prize_id;

      INSERT INTO slot_pool_items (machine_id, slot_prize_id, weight, rush_only, coin_return, return_multiplier, display_name)
      VALUES (v_machine_id, v_prize_id, ret_weights[j], false, true, ret_mults[j], ret_names[j]);
    END LOOP;

    -- 複製 RUSH 獎池模板到此機台
    FOR v_tp IN SELECT * FROM slot_theme_prizes WHERE theme_id = v_theme_id ORDER BY sort_order LOOP
      INSERT INTO slot_prizes (name, level, image_url, remaining, is_active)
      VALUES (v_tp.name, 'normal', v_tp.image_url, v_tp.per_machine_stock, true)
      RETURNING id INTO v_prize_id;

      INSERT INTO slot_pool_items (machine_id, slot_prize_id, weight, rush_only, coin_return, remaining)
      VALUES (v_machine_id, v_prize_id, v_tp.weight, true, false, v_tp.per_machine_stock);
    END LOOP;
  END LOOP;
END;
$$;

COMMIT;
