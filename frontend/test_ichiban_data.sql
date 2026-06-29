-- 測試數據：一番賞商品與獎項
-- 請在 Supabase SQL Editor 中執行

-- 1. 一番賞 海賊王 激戰的軌跡 (Total: 80)
WITH p1 AS (
  INSERT INTO products (product_code, name, image_url, category, price, status, is_hot, total_count, remaining, type)
  VALUES 
  ('10000031', '一番賞 海賊王 激戰的軌跡', 'https://img.toy-people.com/member/169354188673.jpg', 'One Piece', 350, 'active', true, 80, 80, 'ichiban')
  RETURNING id
)
INSERT INTO product_prizes (product_id, level, name, image_url, total, remaining, probability)
SELECT id, level, name, image_url, total, remaining, probability FROM p1 CROSS JOIN (
  VALUES 
    ('A', '蒙其·D·魯夫 決戰模型', 'https://img.toy-people.com/member/169354188673.jpg', 2, 2, 2.5),
    ('B', '羅羅亞·索隆 戰鬥姿態', 'https://img.toy-people.com/member/169354188673.jpg', 2, 2, 2.5),
    ('C', '香吉士 惡魔風腳', 'https://img.toy-people.com/member/169354188673.jpg', 2, 2, 2.5),
    ('D', '大和 人獸型', 'https://img.toy-people.com/member/169354188673.jpg', 1, 1, 1.25),
    ('E', '毛巾 (全8種)', 'https://img.toy-people.com/member/169354188673.jpg', 20, 20, 25.0),
    ('F', '畫板 (全10種)', 'https://img.toy-people.com/member/169354188673.jpg', 25, 25, 31.25),
    ('G', '橡膠吊飾 (全12種)', 'https://img.toy-people.com/member/169354188673.jpg', 28, 28, 35.0),
    ('Last One', '蒙其·D·魯夫 決戰模型 Last One ver.', 'https://img.toy-people.com/member/169354188673.jpg', 1, 1, 0.0)
) AS v(level, name, image_url, total, remaining, probability);

-- 2. 一番賞 七龍珠 VS Omnibus Brave (Total: 80)
WITH p2 AS (
  INSERT INTO products (product_code, name, image_url, category, price, status, is_hot, total_count, remaining, type)
  VALUES 
  ('10000032', '一番賞 七龍珠 VS Omnibus Brave', 'https://shop.r10s.jp/auc-toysanta/cabinet/08000000/10000000/g-4i3d000s1o-007.jpg', 'Dragon Ball', 320, 'active', true, 80, 80, 'ichiban')
  RETURNING id
)
INSERT INTO product_prizes (product_id, level, name, image_url, total, remaining, probability)
SELECT id, level, name, image_url, total, remaining, probability FROM p2 CROSS JOIN (
  VALUES 
    ('A', '孫悟飯 Beast 模型', 'https://shop.r10s.jp/auc-toysanta/cabinet/08000000/10000000/g-4i3d000s1o-007.jpg', 1, 1, 1.25),
    ('B', '橘色比克 模型', 'https://shop.r10s.jp/auc-toysanta/cabinet/08000000/10000000/g-4i3d000s1o-007.jpg', 2, 2, 2.5),
    ('C', '孫悟空 超級賽亞人', 'https://shop.r10s.jp/auc-toysanta/cabinet/08000000/10000000/g-4i3d000s1o-007.jpg', 2, 2, 2.5),
    ('D', '弗利沙 全力型態', 'https://shop.r10s.jp/auc-toysanta/cabinet/08000000/10000000/g-4i3d000s1o-007.jpg', 1, 1, 1.25),
    ('E', '大毛巾', 'https://shop.r10s.jp/auc-toysanta/cabinet/08000000/10000000/g-4i3d000s1o-007.jpg', 24, 24, 30.0),
    ('F', '水杯', 'https://shop.r10s.jp/auc-toysanta/cabinet/08000000/10000000/g-4i3d000s1o-007.jpg', 24, 24, 30.0),
    ('G', '文件夾組', 'https://shop.r10s.jp/auc-toysanta/cabinet/08000000/10000000/g-4i3d000s1o-007.jpg', 26, 26, 32.5),
    ('Last One', '橘色比克 Last One ver.', 'https://shop.r10s.jp/auc-toysanta/cabinet/08000000/10000000/g-4i3d000s1o-007.jpg', 1, 1, 0.0)
) AS v(level, name, image_url, total, remaining, probability);

-- 3. 一番賞 SPY×FAMILY -Mission Start!- (Total: 70)
WITH p3 AS (
  INSERT INTO products (product_code, name, image_url, category, price, status, is_hot, total_count, remaining, type)
  VALUES 
  ('10000033', '一番賞 SPY×FAMILY -Mission Start!-', 'https://s.yimg.com/os/creatr-uploaded-images/2022-04/16f0d7e0-b6aa-11ec-b7ff-1051566e300f', 'SPY×FAMILY', 300, 'active', false, 70, 70, 'ichiban')
  RETURNING id
)
INSERT INTO product_prizes (product_id, level, name, image_url, total, remaining, probability)
SELECT id, level, name, image_url, total, remaining, probability FROM p3 CROSS JOIN (
  VALUES 
    ('A', '安妮亞·佛傑 模型', 'https://s.yimg.com/os/creatr-uploaded-images/2022-04/16f0d7e0-b6aa-11ec-b7ff-1051566e300f', 2, 2, 2.86),
    ('B', '洛伊德·佛傑 絨毛玩偶', 'https://s.yimg.com/os/creatr-uploaded-images/2022-04/16f0d7e0-b6aa-11ec-b7ff-1051566e300f', 2, 2, 2.86),
    ('C', '約兒·佛傑 絨毛玩偶', 'https://s.yimg.com/os/creatr-uploaded-images/2022-04/16f0d7e0-b6aa-11ec-b7ff-1051566e300f', 2, 2, 2.86),
    ('D', '相框插畫', 'https://s.yimg.com/os/creatr-uploaded-images/2022-04/16f0d7e0-b6aa-11ec-b7ff-1051566e300f', 10, 10, 14.29),
    ('E', '橡膠吊飾', 'https://s.yimg.com/os/creatr-uploaded-images/2022-04/16f0d7e0-b6aa-11ec-b7ff-1051566e300f', 18, 18, 25.71),
    ('F', '迷你畫板', 'https://s.yimg.com/os/creatr-uploaded-images/2022-04/16f0d7e0-b6aa-11ec-b7ff-1051566e300f', 18, 18, 25.71),
    ('G', 'Q版模型', 'https://s.yimg.com/os/creatr-uploaded-images/2022-04/16f0d7e0-b6aa-11ec-b7ff-1051566e300f', 18, 18, 25.71),
    ('Last One', '安妮亞·佛傑 Last One ver.', 'https://s.yimg.com/os/creatr-uploaded-images/2022-04/16f0d7e0-b6aa-11ec-b7ff-1051566e300f', 1, 1, 0.0)
) AS v(level, name, image_url, total, remaining, probability);

-- 4. 一番賞 咒術迴戰 (已完售測試 - 用於驗證完抽印章) (Total: 80)
WITH p4 AS (
  INSERT INTO products (product_code, name, image_url, category, price, status, is_hot, total_count, remaining, type)
  VALUES 
  ('10000034', '一番賞 咒術迴戰 (已完售測試)', 'https://p2.bahamut.com.tw/B/2KU/75/4043232049c6691461937968491k46j5.JPG', 'Jujutsu Kaisen', 300, 'active', false, 80, 0, 'ichiban')
  RETURNING id
)
INSERT INTO product_prizes (product_id, level, name, image_url, total, remaining, probability)
SELECT id, level, name, image_url, total, remaining, probability FROM p4 CROSS JOIN (
  VALUES 
    ('A', '虎杖悠仁', 'https://p2.bahamut.com.tw/B/2KU/75/4043232049c6691461937968491k46j5.JPG', 2, 0, 2.5),
    ('B', '伏黑惠', 'https://p2.bahamut.com.tw/B/2KU/75/4043232049c6691461937968491k46j5.JPG', 2, 0, 2.5),
    ('C', '釘崎野薔薇', 'https://p2.bahamut.com.tw/B/2KU/75/4043232049c6691461937968491k46j5.JPG', 2, 0, 2.5),
    ('D', '五條悟', 'https://p2.bahamut.com.tw/B/2KU/75/4043232049c6691461937968491k46j5.JPG', 1, 0, 1.25),
    ('E', '毛巾', 'https://p2.bahamut.com.tw/B/2KU/75/4043232049c6691461937968491k46j5.JPG', 20, 0, 25.0),
    ('F', '吊飾', 'https://p2.bahamut.com.tw/B/2KU/75/4043232049c6691461937968491k46j5.JPG', 25, 0, 31.25),
    ('G', '文件夾', 'https://p2.bahamut.com.tw/B/2KU/75/4043232049c6691461937968491k46j5.JPG', 28, 0, 35.0),
    ('Last One', '宿儺', 'https://p2.bahamut.com.tw/B/2KU/75/4043232049c6691461937968491k46j5.JPG', 1, 0, 0.0)
) AS v(level, name, image_url, total, remaining, probability);
