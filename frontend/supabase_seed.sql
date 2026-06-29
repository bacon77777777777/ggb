-- Seed Data for Ichiban Kuji Online

-- 1. Categories
INSERT INTO public.categories (id, name, sort_order, is_active)
VALUES 
  ('ichiban-kuji', '一番賞', 1, true),
  ('gashapon', '扭蛋', 2, true),
  ('figure', '公仔模型', 3, true)
ON CONFLICT (id) DO NOTHING;

-- 2. Banners
INSERT INTO public.banners (image_url, link_url, sort_order, is_active)
VALUES 
  ('https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?q=80&w=2000&auto=format&fit=crop', '/shop', 1, true),
  ('https://images.unsplash.com/photo-1626544827763-d516dce335e2?q=80&w=2000&auto=format&fit=crop', '/news', 2, true),
  ('https://images.unsplash.com/photo-1563089145-599997674d42?q=80&w=2000&auto=format&fit=crop', '/shop', 3, true)
ON CONFLICT DO NOTHING;

-- 3. News
INSERT INTO public.news (title, content, image_url, category, is_published, published_at)
VALUES 
  ('【系統公告】春節期間出貨調整通知', '親愛的會員您好，春節期間（2/8-2/14）物流配送將暫停服務，期間申請的發貨將於 2/15 起陸續寄出。造成不便敬請見諒。祝大家新年快樂！', 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?q=80&w=2000&auto=format&fit=crop', '公告', true, NOW()),
  ('【新品預告】七龍珠 VS OMNIBUS AMAZING 即將登場！', '眾所期待的七龍珠一番賞新作即將在下週五晚上 8 點準時開抽！本次 A 賞為孫悟空與弗利沙的經典對決場景，絕對值得收藏！', 'https://images.unsplash.com/photo-1626544827763-d516dce335e2?q=80&w=2000&auto=format&fit=crop', '活動', true, NOW() - INTERVAL '2 days'),
  ('【中獎名單】1月份會員回饋抽獎結果公佈', '恭喜以下會員獲得本次會員回饋好禮：\n\n頭獎 PS5 - user123\n二獎 Switch OLED - user456\n三獎 1000G 點數 - user789\n\n獎品將於近日寄出，請留意包裹。', 'https://images.unsplash.com/photo-1563089145-599997674d42?q=80&w=2000&auto=format&fit=crop', '開獎', true, NOW() - INTERVAL '5 days')
ON CONFLICT DO NOTHING;

-- 4. Products (Sample Data)
INSERT INTO public.products (product_code, name, image_url, category, price, status, is_hot, total_count, remaining_count, release_date)
VALUES 
  ('DBZ-001', '七龍珠 VS OMNIBUS BRAVE', 'https://images.unsplash.com/photo-1534423861386-85a16f5d13fd?q=80&w=1000&auto=format&fit=crop', '一番賞', 250, 'active', true, 80, 80, NOW()),
  ('OP-002', '航海王 EX 惡魔果實的能力者們', 'https://images.unsplash.com/photo-1613376023733-0a73315d9b06?q=80&w=1000&auto=format&fit=crop', '一番賞', 260, 'active', true, 80, 75, NOW()),
  ('SPY-003', 'SPY×FAMILY 間諜家家酒 -Mission Start!-', 'https://images.unsplash.com/photo-1612142188908-43d4367927eb?q=80&w=1000&auto=format&fit=crop', '一番賞', 280, 'active', false, 70, 70, NOW()),
  ('JJK-004', '咒術迴戰 澀谷事變', 'https://images.unsplash.com/photo-1576201836106-db1758fd1c97?q=80&w=1000&auto=format&fit=crop', '一番賞', 250, 'active', false, 80, 80, NOW()),
  ('DEMON-005', '鬼滅之刃 襲擊', 'https://images.unsplash.com/photo-1601850494422-3cf14624b0b3?q=80&w=1000&auto=format&fit=crop', '一番賞', 260, 'pending', false, 80, 80, NOW() + INTERVAL '7 days')
ON CONFLICT (product_code) DO NOTHING;

-- 5. Prizes (Sample Data for DBZ-001)
DO $$
DECLARE
  v_product_id BIGINT;
BEGIN
  SELECT id INTO v_product_id FROM public.products WHERE product_code = 'DBZ-001';
  
  IF v_product_id IS NOT NULL THEN
    -- A Prize
    INSERT INTO public.prizes (product_id, grade, name, image_url, quantity, probability)
    VALUES (v_product_id, 'A', '孫悟空 模型', 'https://placehold.co/400x400/png?text=A', 2, 2.5);
    
    -- B Prize
    INSERT INTO public.prizes (product_id, grade, name, image_url, quantity, probability)
    VALUES (v_product_id, 'B', '弗利沙 模型', 'https://placehold.co/400x400/png?text=B', 2, 2.5);
    
    -- C Prize
    INSERT INTO public.prizes (product_id, grade, name, image_url, quantity, probability)
    VALUES (v_product_id, 'C', '魔人普烏 模型', 'https://placehold.co/400x400/png?text=C', 2, 2.5);
    
    -- D Prize
    INSERT INTO public.prizes (product_id, grade, name, image_url, quantity, probability)
    VALUES (v_product_id, 'D', '大毛巾', 'https://placehold.co/400x400/png?text=D', 10, 12.5);
    
    -- E Prize
    INSERT INTO public.prizes (product_id, grade, name, image_url, quantity, probability)
    VALUES (v_product_id, 'E', '水杯', 'https://placehold.co/400x400/png?text=E', 15, 18.75);
    
    -- F Prize
    INSERT INTO public.prizes (product_id, grade, name, image_url, quantity, probability)
    VALUES (v_product_id, 'F', '資料夾組', 'https://placehold.co/400x400/png?text=F', 24, 30.0);
    
    -- G Prize (Using as Last One for simplicity in logic, though typically Last One is separate)
    -- In standard Ichiban Kuji, Last One is given to the person who buys the last ticket.
    -- Here we just seed standard prizes.
    
    -- Last One
    INSERT INTO public.prizes (product_id, grade, name, image_url, quantity, probability)
    VALUES (v_product_id, 'Last One', '神龍 模型 (最後賞)', 'https://placehold.co/400x400/png?text=Last', 1, 0);
  END IF;
END $$;
