-- 191_seed_more_products.sql
-- 新增示範商品：靈感文創 3 款 + 奇幻工房 3 款，含獎品等級設定

DO $$
DECLARE
  v_sup1  BIGINT;
  v_sup2  BIGINT;
  v_cat   UUID;
  v_pid   BIGINT;
BEGIN

  -- ── 廠商 ─────────────────────────────────────────────────
  SELECT id INTO v_sup1 FROM public.suppliers WHERE name = '靈感文創' LIMIT 1;
  IF v_sup1 IS NULL THEN
    INSERT INTO public.suppliers (name, is_active) VALUES ('靈感文創', true) RETURNING id INTO v_sup1;
  END IF;

  SELECT id INTO v_sup2 FROM public.suppliers WHERE name = '奇幻工房' LIMIT 1;
  IF v_sup2 IS NULL THEN
    INSERT INTO public.suppliers (name, is_active, notes)
    VALUES ('奇幻工房', true, '二次合作廠商，專攻動漫 IP')
    RETURNING id INTO v_sup2;
  END IF;

  -- ── 分類 ─────────────────────────────────────────────────
  SELECT id INTO v_cat FROM public.categories WHERE name = '轉蛋' LIMIT 1;
  IF v_cat IS NULL THEN
    INSERT INTO public.categories (name, sort_order, is_active) VALUES ('轉蛋', 10, true) RETURNING id INTO v_cat;
  END IF;

  -- ── 靈感文創 商品 ──────────────────────────────────────────

  -- 1. 夢幻貓咪轉蛋
  IF NOT EXISTS (SELECT 1 FROM products WHERE product_code = '20000001') THEN
    INSERT INTO products (name, product_code, type, price, total_count, remaining, status, is_hot,
      category, category_id, supplier_id, image_url, major_prizes)
    VALUES ('夢幻貓咪轉蛋', '20000001', 'gacha', 80, 120, 120, 'active', true,
      '轉蛋', v_cat, v_sup1,
      'https://images.unsplash.com/photo-1518791841217-8f162f1912da?q=80&w=600&auto=format&fit=crop',
      ARRAY['S賞'])
    RETURNING id INTO v_pid;

    INSERT INTO product_prizes (product_id, level, name, image_url, probability, total, remaining, recycle_value) VALUES
      (v_pid, 'S賞', '特大貓咪絨毛玩偶',  'https://images.unsplash.com/photo-1574158622682-e40e69881006?q=80&w=400&auto=format&fit=crop', 0.02,   2,   2, 200),
      (v_pid, 'A賞', '貓咪造型磁鐵組（4入）', 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?q=80&w=400&auto=format&fit=crop', 0.08,  10,  10,  80),
      (v_pid, 'B賞', '貓咪壓克力立牌',   'https://images.unsplash.com/photo-1529778873920-4da4926a72c2?q=80&w=400&auto=format&fit=crop', 0.20,  24,  24,  30),
      (v_pid, 'C賞', '貓咪貼紙組',       'https://images.unsplash.com/photo-1592194996308-7b43878e84a6?q=80&w=400&auto=format&fit=crop', 0.70,  84,  84,  10);
  END IF;

  -- 2. 童趣農場轉蛋
  IF NOT EXISTS (SELECT 1 FROM products WHERE product_code = '20000002') THEN
    INSERT INTO products (name, product_code, type, price, total_count, remaining, status, is_hot,
      category, category_id, supplier_id, image_url, major_prizes)
    VALUES ('童趣農場轉蛋', '20000002', 'gacha', 60, 200, 200, 'active', false,
      '轉蛋', v_cat, v_sup1,
      'https://images.unsplash.com/photo-1500595046743-cd271d694d30?q=80&w=600&auto=format&fit=crop',
      ARRAY['A賞'])
    RETURNING id INTO v_pid;

    INSERT INTO product_prizes (product_id, level, name, image_url, probability, total, remaining, recycle_value) VALUES
      (v_pid, 'A賞', '農場動物大公仔（隨機款）', 'https://images.unsplash.com/photo-1516467508483-a7212febe31a?q=80&w=400&auto=format&fit=crop', 0.05,  10,  10,  60),
      (v_pid, 'B賞', '迷你農場磁貼組',          'https://images.unsplash.com/photo-1459262838948-3e2de6c1ec80?q=80&w=400&auto=format&fit=crop', 0.15,  30,  30,  25),
      (v_pid, 'C賞', '農場造型橡皮擦',          'https://images.unsplash.com/photo-1484101403633-562f891dc89a?q=80&w=400&auto=format&fit=crop', 0.80, 160, 160,   8);
  END IF;

  -- 3. 星空旅人限定轉蛋
  IF NOT EXISTS (SELECT 1 FROM products WHERE product_code = '20000003') THEN
    INSERT INTO products (name, product_code, type, price, total_count, remaining, status, is_hot,
      category, category_id, supplier_id, image_url, major_prizes)
    VALUES ('星空旅人限定轉蛋', '20000003', 'gacha', 150, 60, 60, 'active', true,
      '轉蛋', v_cat, v_sup1,
      'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?q=80&w=600&auto=format&fit=crop',
      ARRAY['S賞', 'A賞'])
    RETURNING id INTO v_pid;

    INSERT INTO product_prizes (product_id, level, name, image_url, probability, total, remaining, recycle_value) VALUES
      (v_pid, 'S賞', '星空水晶球（附底座）',  'https://images.unsplash.com/photo-1464802686167-b939a6910659?q=80&w=400&auto=format&fit=crop', 0.02,   1,   1, 500),
      (v_pid, 'A賞', '宇宙飛船模型',          'https://images.unsplash.com/photo-1541185933-ef5d8ed016c2?q=80&w=400&auto=format&fit=crop', 0.08,   5,   5, 200),
      (v_pid, 'B賞', '行星金屬徽章組',        'https://images.unsplash.com/photo-1614732414444-096e5f1122d5?q=80&w=400&auto=format&fit=crop', 0.25,  15,  15,  60),
      (v_pid, 'C賞', '星空主題明信片組（5張）', 'https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?q=80&w=400&auto=format&fit=crop', 0.65,  39,  39,  15);
  END IF;

  -- ── 奇幻工房 商品 ──────────────────────────────────────────

  -- 4. 武士道傳說轉蛋
  IF NOT EXISTS (SELECT 1 FROM products WHERE product_code = '20000004') THEN
    INSERT INTO products (name, product_code, type, price, total_count, remaining, status, is_hot,
      category, category_id, supplier_id, image_url, major_prizes)
    VALUES ('武士道傳說轉蛋', '20000004', 'gacha', 100, 100, 100, 'active', true,
      '轉蛋', v_cat, v_sup2,
      'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?q=80&w=600&auto=format&fit=crop',
      ARRAY['S賞'])
    RETURNING id INTO v_pid;

    INSERT INTO product_prizes (product_id, level, name, image_url, probability, total, remaining, recycle_value) VALUES
      (v_pid, 'S賞', '武士甲冑完整套組', 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?q=80&w=400&auto=format&fit=crop', 0.01,   1,   1, 400),
      (v_pid, 'A賞', '武士刀精緻模型',   'https://images.unsplash.com/photo-1612198188060-c7c2a3b66eae?q=80&w=400&auto=format&fit=crop', 0.05,   5,   5, 150),
      (v_pid, 'B賞', '浮世繪風徽章（隨機）', 'https://images.unsplash.com/photo-1528360983277-13d401cdc186?q=80&w=400&auto=format&fit=crop', 0.19,  19,  19,  40),
      (v_pid, 'C賞', '武士道格言書籤組', 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?q=80&w=400&auto=format&fit=crop', 0.75,  75,  75,  10);
  END IF;

  -- 5. 甜蜜糖果轉蛋
  IF NOT EXISTS (SELECT 1 FROM products WHERE product_code = '20000005') THEN
    INSERT INTO products (name, product_code, type, price, total_count, remaining, status, is_hot,
      category, category_id, supplier_id, image_url, major_prizes)
    VALUES ('甜蜜糖果轉蛋', '20000005', 'gacha', 40, 300, 300, 'active', false,
      '轉蛋', v_cat, v_sup2,
      'https://images.unsplash.com/photo-1551024739-78c9e5e4e4b7?q=80&w=600&auto=format&fit=crop',
      ARRAY['A賞'])
    RETURNING id INTO v_pid;

    INSERT INTO product_prizes (product_id, level, name, image_url, probability, total, remaining, recycle_value) VALUES
      (v_pid, 'A賞', '糖果造型錢包（隨機色）', 'https://images.unsplash.com/photo-1582058091505-f87a2e55a40f?q=80&w=400&auto=format&fit=crop', 0.03,   9,   9,  80),
      (v_pid, 'B賞', '馬卡龍髮夾組（3入）',   'https://images.unsplash.com/photo-1569864358642-9d1684040f43?q=80&w=400&auto=format&fit=crop', 0.12,  36,  36,  20),
      (v_pid, 'C賞', '甜點主題貼紙（10入）',  'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?q=80&w=400&auto=format&fit=crop', 0.85, 255, 255,   5);
  END IF;

  -- 6. 海盜船長轉蛋
  IF NOT EXISTS (SELECT 1 FROM products WHERE product_code = '20000006') THEN
    INSERT INTO products (name, product_code, type, price, total_count, remaining, status, is_hot,
      category, category_id, supplier_id, image_url, major_prizes)
    VALUES ('海盜船長轉蛋', '20000006', 'gacha', 90, 80, 80, 'active', false,
      '轉蛋', v_cat, v_sup2,
      'https://images.unsplash.com/photo-1568430462989-44163eb1752f?q=80&w=600&auto=format&fit=crop',
      ARRAY['S賞', 'A賞'])
    RETURNING id INTO v_pid;

    INSERT INTO product_prizes (product_id, level, name, image_url, probability, total, remaining, recycle_value) VALUES
      (v_pid, 'S賞', '海盜船精緻木製模型', 'https://images.unsplash.com/photo-1605281317010-fe5ffe798166?q=80&w=400&auto=format&fit=crop', 0.01,   1,   1, 350),
      (v_pid, 'A賞', '海盜寶箱存錢筒',     'https://images.unsplash.com/photo-1553729459-efe14ef6055d?q=80&w=400&auto=format&fit=crop', 0.06,   5,   5, 120),
      (v_pid, 'B賞', '海盜旗幟徽章組',     'https://images.unsplash.com/photo-1547234935-80c7145ec969?q=80&w=400&auto=format&fit=crop', 0.18,  14,  14,  35),
      (v_pid, 'C賞', '航海地圖明信片（3張）', 'https://images.unsplash.com/photo-1524661135-423995f22d0b?q=80&w=400&auto=format&fit=crop', 0.75,  60,  60,  10);
  END IF;

END $$;
