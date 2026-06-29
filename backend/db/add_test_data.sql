
DO $$
DECLARE
    v_category_onepiece UUID;
    v_category_dragonball UUID;
    v_category_gundam UUID;
    v_category_blindbox UUID;
    v_product_id BIGINT;
BEGIN
    -- 1. Create Categories
    -- Using common names, inserting if not exists logic is implicit by just inserting new ones for testing
    INSERT INTO categories (name, sort_order, is_active) VALUES ('One Piece', 1, true) RETURNING id INTO v_category_onepiece;
    INSERT INTO categories (name, sort_order, is_active) VALUES ('Dragon Ball', 2, true) RETURNING id INTO v_category_dragonball;
    INSERT INTO categories (name, sort_order, is_active) VALUES ('Gundam', 3, true) RETURNING id INTO v_category_gundam;
    INSERT INTO categories (name, sort_order, is_active) VALUES ('Blindbox', 4, true) RETURNING id INTO v_category_blindbox;

    -- 2. Create Products & Prizes

    -- Product 1: One Piece (Hot)
    INSERT INTO products (
        product_code, name, category, category_id, price, status, is_hot, 
        total_count, remaining, image_url, type, major_prizes
    ) VALUES (
        '10000021', '一番賞 海賊王 激戰的軌跡', 'One Piece', v_category_onepiece, 350, 'active', true,
        80, 80, '/images/item.png', 'ichiban', ARRAY['A賞', 'B賞', 'Last One']
    ) RETURNING id INTO v_product_id;

    -- Prizes for Product 1
    INSERT INTO product_prizes (product_id, level, name, image_url, total, remaining, probability) VALUES
    (v_product_id, 'A', '魯夫 激戰模型', '/images/item.png', 2, 2, 2.5),
    (v_product_id, 'B', '索隆 三刀流模型', '/images/item.png', 2, 2, 2.5),
    (v_product_id, 'C', '戰鬥毛巾', '/images/item.png', 20, 20, 25),
    (v_product_id, 'D', '橡膠吊飾', '/images/item.png', 20, 20, 25),
    (v_product_id, 'E', '通緝令資料夾', '/images/item.png', 36, 36, 45),
    (v_product_id, 'Last One', '魯夫 最後賞異色版', '/images/item.png', 1, 1, 0);

    -- Product 2: Dragon Ball
    INSERT INTO products (
        product_code, name, category, category_id, price, status, is_hot, 
        total_count, remaining, image_url, type, major_prizes
    ) VALUES (
        '10000022', '一番賞 七龍珠 傳說的超級賽亞人', 'Dragon Ball', v_category_dragonball, 300, 'active', false,
        70, 70, '/images/item.png', 'ichiban', ARRAY['A賞', 'B賞']
    ) RETURNING id INTO v_product_id;

    -- Prizes for Product 2
    INSERT INTO product_prizes (product_id, level, name, image_url, total, remaining, probability) VALUES
    (v_product_id, 'A', '孫悟空 超賽模型', '/images/item.png', 2, 2, 2.8),
    (v_product_id, 'B', '貝吉塔 王子模型', '/images/item.png', 2, 2, 2.8),
    (v_product_id, 'C', '龍珠杯子', '/images/item.png', 20, 20, 28.5),
    (v_product_id, 'D', '戰鬥力探測器鑰匙圈', '/images/item.png', 46, 46, 65.7),
    (v_product_id, 'Last One', '神龍 巨大模型', '/images/item.png', 1, 1, 0);

    -- Product 3: Gundam
    INSERT INTO products (
        product_code, name, category, category_id, price, status, is_hot, 
        total_count, remaining, image_url, type, major_prizes
    ) VALUES (
        '10000023', '一番賞 鋼彈 水星的魔女', 'Gundam', v_category_gundam, 280, 'active', true,
        60, 60, '/images/item.png', 'ichiban', ARRAY['A賞']
    ) RETURNING id INTO v_product_id;

    -- Prizes for Product 3
    INSERT INTO product_prizes (product_id, level, name, image_url, total, remaining, probability) VALUES
    (v_product_id, 'A', '風靈鋼彈 模型', '/images/item.png', 2, 2, 3.3),
    (v_product_id, 'B', '米奧琳涅 公仔', '/images/item.png', 3, 3, 5),
    (v_product_id, 'C', '學院壓克力立牌', '/images/item.png', 25, 25, 41.6),
    (v_product_id, 'D', '機體貼紙組', '/images/item.png', 30, 30, 50),
    (v_product_id, 'Last One', '風靈鋼彈 帕梅特刻痕版', '/images/item.png', 1, 1, 0);

    -- Product 4: Blindbox
    INSERT INTO products (
        product_code, name, category, category_id, price, status, is_hot, 
        total_count, remaining, image_url, type, major_prizes
    ) VALUES (
        '10000024', '可愛貓咪日常 盲盒', 'Blindbox', v_category_blindbox, 200, 'active', false,
        12, 12, '/images/item.png', 'blindbox', NULL
    ) RETURNING id INTO v_product_id;

    -- Prizes for Product 4
    INSERT INTO product_prizes (product_id, level, name, image_url, total, remaining, probability) VALUES
    (v_product_id, '隱藏款', '國王貓', '/images/item.png', 1, 1, 8.3),
    (v_product_id, '一般款', '睡覺貓', '/images/item.png', 2, 2, 16.6),
    (v_product_id, '一般款', '吃飯貓', '/images/item.png', 3, 3, 25),
    (v_product_id, '一般款', '玩耍貓', '/images/item.png', 3, 3, 25),
    (v_product_id, '一般款', '發呆貓', '/images/item.png', 3, 3, 25);

    -- 3. Create Banners
    -- Using duplicate inserts to create multiple slides
    INSERT INTO banners (image_url, link_url, sort_order, is_active) VALUES 
    ('/images/banner.png', '/shop', 1, true),
    ('/images/banner.png', '/shop', 2, true),
    ('/images/banner.png', '/shop', 3, true),
    ('/images/banner.png', '/shop', 4, true);

END $$;
