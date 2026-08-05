\set ON_ERROR_STOP on
\timing on

-- 壓測商品：名稱一律 LT- 前綴，方便整批清除
-- 比重：一番賞 200 / 轉蛋 130 / 盒玩 90 / 自製賞 50 / 抽卡 26 = 496，另加 4 檔抽籤販售

INSERT INTO products (name, type, price, total_count, remaining, is_active, status, supplier_id, rarity, image_url)
SELECT 'LT-一番賞-' || g, 'ichiban', 100,
       0, 0, false, 'active', 1, 3, '/images/item.png'
FROM generate_series(1, 200) g;

INSERT INTO products (name, type, price, total_count, remaining, is_active, status, supplier_id, rarity, image_url)
SELECT 'LT-轉蛋-' || g, 'gacha', 60, 500, 500, false, 'active', 1, 3, '/images/item.png'
FROM generate_series(1, 130) g;

INSERT INTO products (name, type, price, total_count, remaining, is_active, status, supplier_id, rarity, image_url)
SELECT 'LT-盒玩-' || g, 'blindbox', 80, 300, 300, false, 'active', 1, 3, '/images/item.png'
FROM generate_series(1, 90) g;

INSERT INTO products (name, type, price, total_count, remaining, is_active, status, supplier_id, rarity, image_url)
SELECT 'LT-自製賞-' || g, 'custom', 120, 0, 0, false, 'active', 1, 3, '/images/item.png'
FROM generate_series(1, 50) g;

INSERT INTO products (name, type, price, total_count, remaining, is_active, status, supplier_id, rarity, image_url)
SELECT 'LT-抽卡-' || g, 'card', 150, 0, 0, false, 'active', 1, 3, '/images/item.png'
FROM generate_series(1, 26) g;

SELECT count(*) AS 已建商品 FROM products WHERE name LIKE 'LT-%';
\set ON_ERROR_STOP on
\timing on

-- 一番賞：籤數 300~1000（隨機），A~E 賞
INSERT INTO product_prizes (product_id, level, name, total, remaining, probability, image_url)
SELECT p.id, x.lv, x.lv || ' ' || p.name, x.cnt, x.cnt, 0, '/images/item.png'
FROM (SELECT id, name, 300 + (id * 7) % 700 AS tickets FROM products WHERE name LIKE 'LT-一番賞-%') p
CROSS JOIN LATERAL (VALUES
  ('A賞', GREATEST(1, (p.tickets * 0.01)::int)),
  ('B賞', GREATEST(2, (p.tickets * 0.04)::int)),
  ('C賞', GREATEST(5, (p.tickets * 0.15)::int)),
  ('D賞', GREATEST(10,(p.tickets * 0.30)::int)),
  ('E賞', GREATEST(10,(p.tickets * 0.50)::int))
) AS x(lv, cnt);

-- 自製賞 / 抽卡：籤數較少
INSERT INTO product_prizes (product_id, level, name, total, remaining, probability, image_url)
SELECT p.id, x.lv, x.lv || ' ' || p.name, x.cnt, x.cnt, 0, '/images/item.png'
FROM (SELECT id, name, 100 + (id * 3) % 200 AS tickets FROM products WHERE name LIKE 'LT-自製賞-%' OR name LIKE 'LT-抽卡-%') p
CROSS JOIN LATERAL (VALUES
  ('S', GREATEST(1,(p.tickets * 0.02)::int)),
  ('A', GREATEST(3,(p.tickets * 0.13)::int)),
  ('B', GREATEST(10,(p.tickets * 0.85)::int))
) AS x(lv, cnt);

-- 轉蛋 / 盒玩：機率制，probability 要加總 100
INSERT INTO product_prizes (product_id, level, name, total, remaining, probability, image_url)
SELECT p.id, x.lv, x.lv || ' ' || p.name, x.cnt, x.cnt, x.pr, '/images/item.png'
FROM (SELECT id, name FROM products WHERE name LIKE 'LT-轉蛋-%' OR name LIKE 'LT-盒玩-%') p
CROSS JOIN LATERAL (VALUES
  ('SSR', 5, 2.0), ('SR', 25, 10.0), ('R', 100, 33.0), ('N', 170, 55.0)
) AS x(lv, cnt, pr);

SELECT count(*) AS 品項數 FROM product_prizes pp JOIN products p ON p.id=pp.product_id WHERE p.name LIKE 'LT-%';

-- ═══ 抽籤販售 4 檔（一番賞 ×2 / 抽卡 / 自製賞）═══
INSERT INTO products (name, type, price, total_count, remaining, is_active, status, supplier_id, rarity, image_url,
                      sale_mode, lottery_total_draws, lottery_per_user_draws)
VALUES
 ('LT-抽籤販售-一番賞A','ichiban',0,0,0,false,'active',1,4,'/images/item.png','lottery',500,20),
 ('LT-抽籤販售-一番賞B','ichiban',0,0,0,false,'active',1,4,'/images/item.png','lottery',300,10),
 ('LT-抽籤販售-抽卡',  'card',   0,0,0,false,'active',1,5,'/images/item.png','lottery',400,15),
 ('LT-抽籤販售-自製賞','custom', 0,0,0,false,'active',1,3,'/images/item.png','lottery',200,10);

INSERT INTO product_prizes (product_id, level, name, total, remaining, probability, sale_price, image_url)
SELECT p.id, x.lv, x.lv || ' 中籤品', x.cnt, x.cnt, 0, x.price, '/images/item.png'
FROM (SELECT id FROM products WHERE name LIKE 'LT-抽籤販售-%') p
CROSS JOIN LATERAL (VALUES ('A',3,1800),('B',12,600),('C',40,180)) AS x(lv,cnt,price);

-- ═══ 上架（觸發排籤封存）═══
UPDATE products SET is_active = true WHERE name LIKE 'LT-%';

SELECT type AS 類型, count(*) AS 商品數 FROM products WHERE name LIKE 'LT-%' GROUP BY 1 ORDER BY 2 DESC;
SELECT count(*) AS 已封存, sum(array_length(assignment,1)) AS 總籤數 FROM product_ticket_seals;
