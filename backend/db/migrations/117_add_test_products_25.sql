-- Add 5 test Ichiban products with 25 tickets each
-- Created for testing Last One and full result view logic

DO $$
DECLARE
  v_category_id UUID;
  v_product_id BIGINT;
  i INTEGER;
  v_category_name TEXT := '測試專區';
BEGIN
  -- 1. Get or Create Category
  SELECT id INTO v_category_id FROM categories WHERE name = v_category_name LIMIT 1;
  
  IF v_category_id IS NULL THEN
      -- Try to use 'One Piece' if Test Category doesn't exist, otherwise create Test Category
      SELECT id INTO v_category_id FROM categories WHERE name = 'One Piece' LIMIT 1;
      
      IF v_category_id IS NULL THEN
        INSERT INTO categories (name, sort_order, is_active) VALUES (v_category_name, 99, true) RETURNING id INTO v_category_id;
      END IF;
  END IF;

  -- Insert products
    FOR i IN 1..10 LOOP
        INSERT INTO products (
            name, 
            product_code, 
            category_id, 
            category,
            price, 
            status, 
            is_hot, 
            total_count, 
            remaining, 
            image_url, 
            type, 
            major_prizes
        ) VALUES (
            '測試一番賞 25抽 (No.' || i || ')',
            (10000040 + i)::text, -- Sequential 8-digit code starting from 10000041
            v_category_id,
            v_category_name,
            100, -- Price 100
            'active',
            CASE WHEN i = 1 THEN true ELSE false END, -- Make first one Hot
            25,
            25,
            'https://placehold.co/600x400/png?text=Test+Product+' || i,
            'ichiban',
            ARRAY['A賞', 'Last One']
        )
        RETURNING id INTO v_product_id;

    -- Insert Prizes (Total 25)
    -- A賞: 1 (4%)
    -- B賞: 2 (8%)
    -- C賞: 2 (8%)
    -- D賞: 5 (20%)
    -- E賞: 15 (60%)
    -- Last One: 1
    INSERT INTO product_prizes (product_id, level, name, image_url, total, remaining, probability) VALUES
    (v_product_id, 'A賞', '特大模型 (Test A)', 'https://placehold.co/400x400/png?text=Prize+A', 1, 1, 4.0),
    (v_product_id, 'B賞', '精緻公仔 (Test B)', 'https://placehold.co/400x400/png?text=Prize+B', 2, 2, 8.0),
    (v_product_id, 'C賞', '造型毛巾 (Test C)', 'https://placehold.co/400x400/png?text=Prize+C', 2, 2, 8.0),
    (v_product_id, 'D賞', '玻璃杯 (Test D)', 'https://placehold.co/400x400/png?text=Prize+D', 5, 5, 20.0),
    (v_product_id, 'E賞', '軟膠吊飾 (Test E)', 'https://placehold.co/400x400/png?text=Prize+E', 15, 15, 60.0),
    (v_product_id, 'Last One', '最後賞限定版 (Last One)', 'https://placehold.co/400x400/png?text=Last+One', 1, 1, 0);

  END LOOP;
END $$;
