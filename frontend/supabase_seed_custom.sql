-- Fix missing columns in products table
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS total_count INTEGER DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS remaining_count INTEGER DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS release_date DATE;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_hot BOOLEAN DEFAULT false;

-- Insert 5 Banners
INSERT INTO public.banners (image_url, link_url, sort_order, is_active)
SELECT 
  'https://placehold.co/1200x298/cccccc/000000/png?text=1200x298',
  '/shop',
  i,
  true
FROM generate_series(1, 5) as i;

-- Insert 20 Products and their Prizes
DO $$
DECLARE
  i INTEGER;
  v_product_id BIGINT;
BEGIN
  FOR i IN 1..20 LOOP
    -- Insert Product
    INSERT INTO public.products (
      product_code, 
      name, 
      image_url, 
      category, 
      price, 
      status, 
      is_hot, 
      total_count, 
      remaining_count, 
      release_date
    )
    VALUES (
      (10000000 + i)::text,
      '測試商品 ' || i,
      'https://placehold.co/400x400/cccccc/000000/png?text=400x400',
      '一番賞',
      250,
      'active',
      (i % 5 = 0),
      80,
      80,
      NOW()
    )
    ON CONFLICT (product_code) DO UPDATE 
    SET name = EXCLUDED.name -- Dummy update to ensure we can get ID
    RETURNING id INTO v_product_id;

    -- If product was inserted (or updated), v_product_id will be set. 
    -- If ON CONFLICT DO NOTHING, v_product_id might be null if it already existed.
    -- To be safe, let's select it if null.
    IF v_product_id IS NULL THEN
      SELECT id INTO v_product_id FROM public.products WHERE product_code = (10000000 + i)::text;
    END IF;

    -- Check if prizes exist, if not insert them
    IF NOT EXISTS (SELECT 1 FROM public.prizes WHERE product_id = v_product_id) THEN
        -- Insert Prizes (Total 80 items)
        
        -- A Prize (1 qty)
        INSERT INTO public.prizes (product_id, grade, name, image_url, quantity, probability)
        VALUES (v_product_id, 'A', 'A賞 模型', 'https://placehold.co/400x400/cccccc/000000/png?text=A', 1, 1.25);
        
        -- B Prize (2 qty)
        INSERT INTO public.prizes (product_id, grade, name, image_url, quantity, probability)
        VALUES (v_product_id, 'B', 'B賞 模型', 'https://placehold.co/400x400/cccccc/000000/png?text=B', 2, 2.5);

        -- C Prize (2 qty)
        INSERT INTO public.prizes (product_id, grade, name, image_url, quantity, probability)
        VALUES (v_product_id, 'C', 'C賞 公仔', 'https://placehold.co/400x400/cccccc/000000/png?text=C', 2, 2.5);

        -- D Prize (5 qty)
        INSERT INTO public.prizes (product_id, grade, name, image_url, quantity, probability)
        VALUES (v_product_id, 'D', 'D賞 毛巾', 'https://placehold.co/400x400/cccccc/000000/png?text=D', 5, 6.25);

        -- E Prize (10 qty)
        INSERT INTO public.prizes (product_id, grade, name, image_url, quantity, probability)
        VALUES (v_product_id, 'E', 'E賞 杯子', 'https://placehold.co/400x400/cccccc/000000/png?text=E', 10, 12.5);

        -- F Prize (20 qty)
        INSERT INTO public.prizes (product_id, grade, name, image_url, quantity, probability)
        VALUES (v_product_id, 'F', 'F賞 資料夾', 'https://placehold.co/400x400/cccccc/000000/png?text=F', 20, 25.0);

        -- G Prize (40 qty)
        INSERT INTO public.prizes (product_id, grade, name, image_url, quantity, probability)
        VALUES (v_product_id, 'G', 'G賞 吊飾', 'https://placehold.co/400x400/cccccc/000000/png?text=G', 40, 50.0);

        -- Last One
        INSERT INTO public.prizes (product_id, grade, name, image_url, quantity, probability)
        VALUES (v_product_id, 'Last One', '最後賞', 'https://placehold.co/400x400/cccccc/000000/png?text=Last', 1, 0);
    END IF;
    
  END LOOP;
END $$;
