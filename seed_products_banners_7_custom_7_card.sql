DO $$
DECLARE
  v_category_custom_id UUID;
  v_category_card_id UUID;
  v_product_id BIGINT;
  i INTEGER;
  v_supabase_url TEXT := 'https://YOUR_SUPABASE_PROJECT.supabase.co';
BEGIN
  SELECT id INTO v_category_custom_id FROM public.categories WHERE name = '自製賞' LIMIT 1;
  IF v_category_custom_id IS NULL THEN
    INSERT INTO public.categories (name, sort_order, is_active)
    VALUES ('自製賞', 20, true)
    RETURNING id INTO v_category_custom_id;
  END IF;

  SELECT id INTO v_category_card_id FROM public.categories WHERE name = '抽卡' LIMIT 1;
  IF v_category_card_id IS NULL THEN
    INSERT INTO public.categories (name, sort_order, is_active)
    VALUES ('抽卡', 21, true)
    RETURNING id INTO v_category_card_id;
  END IF;

  DELETE FROM public.banners WHERE sort_order BETWEEN 101 AND 107;
  DELETE FROM public.products WHERE product_code BETWEEN '90000001' AND '90000014';

  INSERT INTO public.banners (image_url, link_url, sort_order, is_active)
  VALUES
    ('/images/banner/1bankuji-brand_banner_pink_0321.jpg', '/products', 101, true),
    ('/images/banner/7DB_banner_1002-429_0614.jpg', '/products', 102, true),
    ('/images/banner/kimetsu_kuji.jpg', '/products', 103, true),
    ('/images/banner/1bankuji-brand_banner_pink_0321.jpg', '/products', 104, true),
    ('/images/banner/7DB_banner_1002-429_0614.jpg', '/products', 105, true),
    ('/images/banner/kimetsu_kuji.jpg', '/products', 106, true),
    ('/images/banner/1bankuji-brand_banner_pink_0321.jpg', '/products', 107, true);

  FOR i IN 1..7 LOOP
    INSERT INTO public.products (
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
      type
    ) VALUES (
      '自製賞 測試機台 ' || LPAD(i::text, 2, '0'),
      (90000000 + i)::text,
      v_category_custom_id,
      '自製賞',
      200,
      'active',
      (i = 1),
      25,
      25,
      v_supabase_url || '/storage/v1/object/public/products/custom_' || LPAD(i::text, 2, '0') || '.webp',
      'custom'
    )
    RETURNING id INTO v_product_id;

    INSERT INTO public.product_prizes (product_id, level, name, image_url, total, remaining, probability)
    VALUES
      (v_product_id, 'A賞', '自製賞 A (No.' || i || ')', v_supabase_url || '/storage/v1/object/public/products/custom_' || LPAD(i::text, 2, '0') || '_a.webp', 1, 1, 4.00),
      (v_product_id, 'B賞', '自製賞 B (No.' || i || ')', v_supabase_url || '/storage/v1/object/public/products/custom_' || LPAD(i::text, 2, '0') || '_b.webp', 2, 2, 8.00),
      (v_product_id, 'C賞', '自製賞 C (No.' || i || ')', v_supabase_url || '/storage/v1/object/public/products/custom_' || LPAD(i::text, 2, '0') || '_c.webp', 22, 22, 88.00),
      (v_product_id, '最後賞', '自製賞 最後賞 (No.' || i || ')', v_supabase_url || '/storage/v1/object/public/products/custom_' || LPAD(i::text, 2, '0') || '_lo.webp', 1, 1, 0);
  END LOOP;

  FOR i IN 1..7 LOOP
    INSERT INTO public.products (
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
      type
    ) VALUES (
      '抽卡 測試池 ' || LPAD(i::text, 2, '0'),
      (90000007 + i)::text,
      v_category_card_id,
      '抽卡',
      50,
      'active',
      (i = 1),
      100,
      100,
      v_supabase_url || '/storage/v1/object/public/products/card_' || LPAD(i::text, 2, '0') || '.webp',
      'card'
    )
    RETURNING id INTO v_product_id;

    INSERT INTO public.product_prizes (product_id, level, name, image_url, total, remaining, probability)
    VALUES
      (v_product_id, 'SSR', 'SSR 卡牌 (No.' || i || ')', v_supabase_url || '/storage/v1/object/public/products/card_' || LPAD(i::text, 2, '0') || '_ssr.webp', 1, 1, 1.00),
      (v_product_id, 'SR',  'SR 卡牌 (No.' || i || ')',  v_supabase_url || '/storage/v1/object/public/products/card_' || LPAD(i::text, 2, '0') || '_sr.webp',  4, 4, 4.00),
      (v_product_id, 'R',   'R 卡牌 (No.' || i || ')',   v_supabase_url || '/storage/v1/object/public/products/card_' || LPAD(i::text, 2, '0') || '_r.webp',   20, 20, 20.00),
      (v_product_id, 'N',   'N 卡牌 (No.' || i || ')',   v_supabase_url || '/storage/v1/object/public/products/card_' || LPAD(i::text, 2, '0') || '_n.webp',   75, 75, 75.00);
  END LOOP;
END $$;
