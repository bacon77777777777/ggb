-- Seed Gacha Products
-- Created at: 2026-02-11
-- Updated at: 2026-02-12 (Fix: set type='gacha', category_id, remove duplicates)

DO $$
DECLARE
  v_category_id UUID;
  v_product_id BIGINT;
BEGIN
  -- 1. Get or Create Category '轉蛋'
  SELECT id INTO v_category_id FROM categories WHERE name = '轉蛋';
  
  IF v_category_id IS NULL THEN
    INSERT INTO categories (name, sort_order, is_active)
    VALUES ('轉蛋', 10, true)
    RETURNING id INTO v_category_id;
  END IF;

  -- 2. Cleanup existing seed data to avoid duplicates (if re-running)
  -- Deleting products will cascade delete prizes
  DELETE FROM products WHERE product_code IN ('10000008', '10000009', '10000010');

  -- 3. Product 1: 元宵節限定轉蛋 (Lantern Festival Limited)
  INSERT INTO products (
    name, 
    price, 
    type, 
    image_url, 
    total_count, 
    remaining, 
    status, 
    product_code,
    category,
    category_id
  )
  VALUES (
    '元宵節限定轉蛋', 
    100, 
    'gacha', 
    'https://images.unsplash.com/photo-1513205737350-b86a02b6505e?q=80&w=600&auto=format&fit=crop', -- Lantern image
    100, 
    100, 
    'active', 
    '10000008',
    '轉蛋',
    v_category_id
  )
  RETURNING id INTO v_product_id;

  -- Prizes for Product 1
  INSERT INTO product_prizes (product_id, level, name, image_url, probability, total, remaining)
  VALUES
  (v_product_id, 'S賞', '純金湯圓紀念幣', 'https://images.unsplash.com/photo-1610375461490-67a3386e9ec0?q=80&w=400&auto=format&fit=crop', 0.01, 1, 1),
  (v_product_id, 'A賞', '特大元宵抱枕', 'https://images.unsplash.com/photo-1572295679587-c8680c441b4c?q=80&w=400&auto=format&fit=crop', 0.05, 5, 5),
  (v_product_id, 'B賞', '精緻燈籠吊飾', 'https://images.unsplash.com/photo-1513205737350-b86a02b6505e?q=80&w=400&auto=format&fit=crop', 0.15, 15, 15),
  (v_product_id, 'C賞', '節日限定貼紙組', 'https://images.unsplash.com/photo-1572375992501-4b0892d50c69?q=80&w=400&auto=format&fit=crop', 0.79, 79, 79);

  -- Product 2: 萌寵大集合 (Cute Pets Collection)
  INSERT INTO products (
    name, 
    price, 
    type,
    image_url, 
    total_count, 
    remaining, 
    status, 
    product_code,
    category,
    category_id
  )
  VALUES (
    '萌寵大集合', 
    60, 
    'gacha',
    'https://images.unsplash.com/photo-1516934024742-b461fba47600?q=80&w=600&auto=format&fit=crop', -- Animal capsule image
    200, 
    200, 
    'active', 
    '10000009',
    '轉蛋',
    v_category_id
  )
  RETURNING id INTO v_product_id;

  -- Prizes for Product 2
  INSERT INTO product_prizes (product_id, level, name, image_url, probability, total, remaining)
  VALUES
  (v_product_id, 'A賞', '柴犬公仔 (坐姿版)', 'https://images.unsplash.com/photo-1583337130417-3346a1be7dee?q=80&w=400&auto=format&fit=crop', 0.10, 20, 20),
  (v_product_id, 'B賞', '三花貓公仔 (睡覺版)', 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?q=80&w=400&auto=format&fit=crop', 0.30, 60, 60),
  (v_product_id, 'C賞', '倉鼠公仔 (吃瓜子版)', 'https://images.unsplash.com/photo-1548767797-d8c844163c65?q=80&w=400&auto=format&fit=crop', 0.60, 120, 120);

  -- Product 3: 復古電玩系列 (Retro Gaming)
  INSERT INTO products (
    name, 
    price, 
    type,
    image_url, 
    total_count, 
    remaining, 
    status, 
    product_code,
    category,
    category_id
  )
  VALUES (
    '復古電玩系列', 
    80, 
    'gacha',
    'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=600&auto=format&fit=crop', -- Retro game image
    150, 
    150, 
    'active', 
    '10000010',
    '轉蛋',
    v_category_id
  )
  RETURNING id INTO v_product_id;

  -- Prizes for Product 3
  INSERT INTO product_prizes (product_id, level, name, image_url, probability, total, remaining)
  VALUES
  (v_product_id, 'S賞', '迷你街機模型', 'https://images.unsplash.com/photo-1592840496694-26d035b52b48?q=80&w=400&auto=format&fit=crop', 0.05, 8, 8),
  (v_product_id, 'A賞', '像素劍鑰匙圈', 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?q=80&w=400&auto=format&fit=crop', 0.15, 22, 22),
  (v_product_id, 'B賞', '遊戲手把造型磁鐵', 'https://images.unsplash.com/photo-1600080972464-8e5f35f63d88?q=80&w=400&auto=format&fit=crop', 0.30, 45, 45),
  (v_product_id, 'C賞', '8-bit徽章盲袋', 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=400&auto=format&fit=crop', 0.50, 75, 75);

END $$;
