-- 188_seed_demo_data.sql
-- Demo seed: ~42 days of realistic gacha platform activity
-- Safe to re-run (uses WHERE NOT EXISTS for products; generates new record IDs each time)

DO $$
DECLARE
  v_user_id    UUID;
  v_supplier_id BIGINT;
  v_product_ids BIGINT[];
  v_pid        BIGINT;
  v_day        DATE;
  v_i          INTEGER;
  v_amount     NUMERIC;
  v_payment    TEXT;
  v_prize      TEXT;
  v_order_num  TEXT;
  v_recharges  INT;
  v_draws      INT;
  v_rnd        FLOAT;
BEGIN

  -- 1. 取得現有用戶（第一筆）
  SELECT id INTO v_user_id FROM public.users ORDER BY created_at LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'No users found — skipping seed';
    RETURN;
  END IF;

  -- 2. 取得或建立廠商
  SELECT id INTO v_supplier_id FROM suppliers WHERE name = '靈感文創' LIMIT 1;
  IF v_supplier_id IS NULL THEN
    INSERT INTO suppliers (name, is_active) VALUES ('靈感文創', true) RETURNING id INTO v_supplier_id;
  END IF;

  -- 3. 建立示範商品（已存在則跳過）
  INSERT INTO products (name, type, price, total_count, remaining, is_active, supplier_id, category)
  SELECT t.name, 'gacha', t.price, t.total_count, t.remaining, true, v_supplier_id, t.cat
  FROM (VALUES
    ('彩虹兔兔扭蛋',   50,  200, 120, '公仔'),
    ('星際戰士扭蛋',   80,  150,  90, '公仔'),
    ('限定水晶球扭蛋', 100, 100,  55, '限定'),
    ('萌寵動物扭蛋',   30,  300, 210, '公仔'),
    ('黃金傳說扭蛋',  150,  50,  22, '限定'),
    ('基本款扭蛋',     20,  500, 350, '基本')
  ) AS t(name, price, total_count, remaining, cat)
  WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.name = t.name);

  -- 4. 取得商品 ID 陣列
  SELECT ARRAY_AGG(id ORDER BY id) INTO v_product_ids
  FROM (SELECT id FROM products WHERE type = 'gacha' AND is_active = true LIMIT 10) sub;

  IF array_length(v_product_ids, 1) IS NULL THEN
    RAISE NOTICE 'No gacha products found';
    RETURN;
  END IF;

  -- 5. 儲值紀錄：過去 42 天
  FOR v_day IN
    SELECT d::date FROM generate_series(CURRENT_DATE - 42, CURRENT_DATE - 1, '1 day'::interval) d
  LOOP
    -- 平日量稍多，週末稍少
    v_recharges := CASE EXTRACT(dow FROM v_day)
      WHEN 0 THEN 2 + floor(random() * 3)::int   -- 週日
      WHEN 6 THEN 3 + floor(random() * 4)::int   -- 週六
      ELSE    4 + floor(random() * 7)::int        -- 週一~五
    END;

    FOR v_i IN 1..v_recharges LOOP
      v_rnd := random();
      v_amount := CASE
        WHEN v_rnd < 0.35 THEN 100
        WHEN v_rnd < 0.58 THEN 200
        WHEN v_rnd < 0.76 THEN 300
        WHEN v_rnd < 0.90 THEN 500
        ELSE 1000
      END;
      v_payment := CASE floor(random() * 4)::int
        WHEN 0 THEN 'credit_card'
        WHEN 1 THEN 'webatm'
        WHEN 2 THEN 'vacc'
        ELSE 'cvs'
      END;
      v_order_num := 'DEMO' || to_char(v_day, 'YYYYMMDD') || lpad(v_i::text, 3, '0');

      INSERT INTO recharge_records
        (order_number, user_id, amount, bonus, status, payment_method, created_at)
      VALUES (
        v_order_num,
        v_user_id,
        v_amount,
        CASE WHEN v_amount >= 500 THEN v_amount * 0.1 ELSE 0 END,
        CASE WHEN random() < 0.88 THEN 'success'
             WHEN random() < 0.50 THEN 'pending'
             ELSE 'failed' END,
        v_payment,
        (v_day + interval '8 hours' + (random() * interval '14 hours'))::timestamptz
      );
    END LOOP;
  END LOOP;

  -- 6. 抽獎紀錄：過去 42 天
  FOR v_day IN
    SELECT d::date FROM generate_series(CURRENT_DATE - 42, CURRENT_DATE - 1, '1 day'::interval) d
  LOOP
    v_draws := CASE EXTRACT(dow FROM v_day)
      WHEN 0 THEN 10 + floor(random() * 20)::int  -- 週日
      WHEN 6 THEN 18 + floor(random() * 25)::int  -- 週六
      ELSE    12 + floor(random() * 28)::int       -- 週一~五
    END;

    FOR v_i IN 1..v_draws LOOP
      -- 隨機選商品（1-indexed）
      v_pid := v_product_ids[1 + floor(random() * array_length(v_product_ids, 1))::int];
      IF v_pid IS NULL THEN
        v_pid := v_product_ids[1];
      END IF;

      v_rnd := random();
      v_prize := CASE
        WHEN v_rnd < 0.03 THEN 'A'
        WHEN v_rnd < 0.10 THEN 'B'
        WHEN v_rnd < 0.30 THEN 'C'
        ELSE 'D'
      END;

      INSERT INTO draw_records (user_id, product_id, prize_level, status, created_at)
      VALUES (
        v_user_id,
        v_pid,
        v_prize,
        'success',
        (v_day + interval '8 hours' + (random() * interval '14 hours'))::timestamptz
      );
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Demo seed completed — user: %', v_user_id;
END $$;
