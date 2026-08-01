-- 灌籃SLAM DUNK 獎池（STG 內容種子）
--
-- 卡面由 scripts/build_nba_cards.ts 以 NBA 官方公開球員照合成後上傳 R2。
-- 正式販售前應改為廠商實拍圖，使獎池圖片與實際寄出的卡片一致。
--
-- 價值校準：10 檔平均 544G（約 54.4 倍投注），與絕頂RUSH 同級，
-- 搭配返還 38.7%、保底 200 轉 → RTP 約 82%。其餘檔次等比放大。
-- 可重複執行（先刪同名商品再重建）。

BEGIN;

DELETE FROM public.products WHERE type='slot' AND name LIKE '灌籃SLAM DUNK(%)';


WITH np AS (
  INSERT INTO public.products (name, type, status, price, remaining, total_count, supplier_id, image_url, category)
  VALUES ('灌籃SLAM DUNK(10)', 'slot', 'pending', 0, 100, 100,
          (SELECT supplier_id FROM public.slot_themes WHERE name='灌籃SLAM DUNK'),
          'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/2544.webp', '機台')
  RETURNING id
)
INSERT INTO public.product_prizes (product_id, level, name, image_url, recycle_value, remaining, total, probability)
SELECT np.id, v.level, v.name, v.img, v.val, 5, 5, 0 FROM np, (VALUES
  ('一等獎', 'LeBron James', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/2544.webp', 1000),
  ('一等獎', 'Stephen Curry', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/201939.webp', 1000),
  ('一等獎', 'Nikola Jokic', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/203999.webp', 1000),
  ('二等獎', 'Luka Doncic', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1629029.webp', 650),
  ('二等獎', 'Jayson Tatum', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1628369.webp', 650),
  ('二等獎', 'Giannis Antetokounmpo', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/203507.webp', 650),
  ('二等獎', 'Shai Gilgeous-Alexander', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1628983.webp', 650),
  ('三等獎', 'Kevin Durant', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/201142.webp', 470),
  ('三等獎', 'Jaylen Brown', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1627759.webp', 470),
  ('三等獎', 'Anthony Edwards', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1630162.webp', 470),
  ('三等獎', 'Donovan Mitchell', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1628378.webp', 470),
  ('三等獎', 'Zion Williamson', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1629627.webp', 470),
  ('三等獎', 'Joel Embiid', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/203954.webp', 470),
  ('三等獎', 'Tyrese Haliburton', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1630224.webp', 350),
  ('三等獎', 'Ja Morant', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1629630.webp', 350),
  ('三等獎', 'Jalen Brunson', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1628973.webp', 350),
  ('三等獎', 'Paolo Banchero', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1631094.webp', 350),
  ('三等獎', 'Desmond Bane', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1630173.webp', 350),
  ('三等獎', 'Devin Booker', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1626164.webp', 350),
  ('三等獎', 'Pascal Siakam', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1627783.webp', 350)
) AS v(level, name, img, val);

WITH np AS (
  INSERT INTO public.products (name, type, status, price, remaining, total_count, supplier_id, image_url, category)
  VALUES ('灌籃SLAM DUNK(20)', 'slot', 'pending', 0, 100, 100,
          (SELECT supplier_id FROM public.slot_themes WHERE name='灌籃SLAM DUNK'),
          'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/2544.webp', '機台')
  RETURNING id
)
INSERT INTO public.product_prizes (product_id, level, name, image_url, recycle_value, remaining, total, probability)
SELECT np.id, v.level, v.name, v.img, v.val, 5, 5, 0 FROM np, (VALUES
  ('一等獎', 'LeBron James', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/2544.webp', 2000),
  ('一等獎', 'Stephen Curry', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/201939.webp', 2000),
  ('一等獎', 'Nikola Jokic', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/203999.webp', 2000),
  ('二等獎', 'Luka Doncic', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1629029.webp', 1300),
  ('二等獎', 'Jayson Tatum', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1628369.webp', 1300),
  ('二等獎', 'Giannis Antetokounmpo', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/203507.webp', 1300),
  ('二等獎', 'Shai Gilgeous-Alexander', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1628983.webp', 1300),
  ('三等獎', 'Kevin Durant', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/201142.webp', 940),
  ('三等獎', 'Jaylen Brown', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1627759.webp', 940),
  ('三等獎', 'Anthony Edwards', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1630162.webp', 940),
  ('三等獎', 'Donovan Mitchell', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1628378.webp', 940),
  ('三等獎', 'Zion Williamson', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1629627.webp', 940),
  ('三等獎', 'Joel Embiid', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/203954.webp', 940),
  ('三等獎', 'Tyrese Haliburton', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1630224.webp', 700),
  ('三等獎', 'Ja Morant', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1629630.webp', 700),
  ('三等獎', 'Jalen Brunson', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1628973.webp', 700),
  ('三等獎', 'Paolo Banchero', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1631094.webp', 700),
  ('三等獎', 'Desmond Bane', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1630173.webp', 700),
  ('三等獎', 'Devin Booker', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1626164.webp', 700),
  ('三等獎', 'Pascal Siakam', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1627783.webp', 700)
) AS v(level, name, img, val);

WITH np AS (
  INSERT INTO public.products (name, type, status, price, remaining, total_count, supplier_id, image_url, category)
  VALUES ('灌籃SLAM DUNK(50)', 'slot', 'pending', 0, 100, 100,
          (SELECT supplier_id FROM public.slot_themes WHERE name='灌籃SLAM DUNK'),
          'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/2544.webp', '機台')
  RETURNING id
)
INSERT INTO public.product_prizes (product_id, level, name, image_url, recycle_value, remaining, total, probability)
SELECT np.id, v.level, v.name, v.img, v.val, 5, 5, 0 FROM np, (VALUES
  ('一等獎', 'LeBron James', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/2544.webp', 5000),
  ('一等獎', 'Stephen Curry', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/201939.webp', 5000),
  ('一等獎', 'Nikola Jokic', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/203999.webp', 5000),
  ('二等獎', 'Luka Doncic', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1629029.webp', 3250),
  ('二等獎', 'Jayson Tatum', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1628369.webp', 3250),
  ('二等獎', 'Giannis Antetokounmpo', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/203507.webp', 3250),
  ('二等獎', 'Shai Gilgeous-Alexander', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1628983.webp', 3250),
  ('三等獎', 'Kevin Durant', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/201142.webp', 2350),
  ('三等獎', 'Jaylen Brown', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1627759.webp', 2350),
  ('三等獎', 'Anthony Edwards', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1630162.webp', 2350),
  ('三等獎', 'Donovan Mitchell', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1628378.webp', 2350),
  ('三等獎', 'Zion Williamson', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1629627.webp', 2350),
  ('三等獎', 'Joel Embiid', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/203954.webp', 2350),
  ('三等獎', 'Tyrese Haliburton', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1630224.webp', 1750),
  ('三等獎', 'Ja Morant', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1629630.webp', 1750),
  ('三等獎', 'Jalen Brunson', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1628973.webp', 1750),
  ('三等獎', 'Paolo Banchero', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1631094.webp', 1750),
  ('三等獎', 'Desmond Bane', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1630173.webp', 1750),
  ('三等獎', 'Devin Booker', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1626164.webp', 1750),
  ('三等獎', 'Pascal Siakam', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1627783.webp', 1750)
) AS v(level, name, img, val);

WITH np AS (
  INSERT INTO public.products (name, type, status, price, remaining, total_count, supplier_id, image_url, category)
  VALUES ('灌籃SLAM DUNK(100)', 'slot', 'pending', 0, 100, 100,
          (SELECT supplier_id FROM public.slot_themes WHERE name='灌籃SLAM DUNK'),
          'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/2544.webp', '機台')
  RETURNING id
)
INSERT INTO public.product_prizes (product_id, level, name, image_url, recycle_value, remaining, total, probability)
SELECT np.id, v.level, v.name, v.img, v.val, 5, 5, 0 FROM np, (VALUES
  ('一等獎', 'LeBron James', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/2544.webp', 10000),
  ('一等獎', 'Stephen Curry', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/201939.webp', 10000),
  ('一等獎', 'Nikola Jokic', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/203999.webp', 10000),
  ('二等獎', 'Luka Doncic', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1629029.webp', 6500),
  ('二等獎', 'Jayson Tatum', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1628369.webp', 6500),
  ('二等獎', 'Giannis Antetokounmpo', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/203507.webp', 6500),
  ('二等獎', 'Shai Gilgeous-Alexander', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1628983.webp', 6500),
  ('三等獎', 'Kevin Durant', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/201142.webp', 4700),
  ('三等獎', 'Jaylen Brown', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1627759.webp', 4700),
  ('三等獎', 'Anthony Edwards', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1630162.webp', 4700),
  ('三等獎', 'Donovan Mitchell', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1628378.webp', 4700),
  ('三等獎', 'Zion Williamson', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1629627.webp', 4700),
  ('三等獎', 'Joel Embiid', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/203954.webp', 4700),
  ('三等獎', 'Tyrese Haliburton', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1630224.webp', 3500),
  ('三等獎', 'Ja Morant', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1629630.webp', 3500),
  ('三等獎', 'Jalen Brunson', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1628973.webp', 3500),
  ('三等獎', 'Paolo Banchero', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1631094.webp', 3500),
  ('三等獎', 'Desmond Bane', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1630173.webp', 3500),
  ('三等獎', 'Devin Booker', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1626164.webp', 3500),
  ('三等獎', 'Pascal Siakam', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1627783.webp', 3500)
) AS v(level, name, img, val);

WITH np AS (
  INSERT INTO public.products (name, type, status, price, remaining, total_count, supplier_id, image_url, category)
  VALUES ('灌籃SLAM DUNK(300)', 'slot', 'pending', 0, 100, 100,
          (SELECT supplier_id FROM public.slot_themes WHERE name='灌籃SLAM DUNK'),
          'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/2544.webp', '機台')
  RETURNING id
)
INSERT INTO public.product_prizes (product_id, level, name, image_url, recycle_value, remaining, total, probability)
SELECT np.id, v.level, v.name, v.img, v.val, 5, 5, 0 FROM np, (VALUES
  ('一等獎', 'LeBron James', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/2544.webp', 30000),
  ('一等獎', 'Stephen Curry', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/201939.webp', 30000),
  ('一等獎', 'Nikola Jokic', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/203999.webp', 30000),
  ('二等獎', 'Luka Doncic', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1629029.webp', 19500),
  ('二等獎', 'Jayson Tatum', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1628369.webp', 19500),
  ('二等獎', 'Giannis Antetokounmpo', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/203507.webp', 19500),
  ('二等獎', 'Shai Gilgeous-Alexander', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1628983.webp', 19500),
  ('三等獎', 'Kevin Durant', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/201142.webp', 14100),
  ('三等獎', 'Jaylen Brown', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1627759.webp', 14100),
  ('三等獎', 'Anthony Edwards', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1630162.webp', 14100),
  ('三等獎', 'Donovan Mitchell', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1628378.webp', 14100),
  ('三等獎', 'Zion Williamson', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1629627.webp', 14100),
  ('三等獎', 'Joel Embiid', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/203954.webp', 14100),
  ('三等獎', 'Tyrese Haliburton', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1630224.webp', 10500),
  ('三等獎', 'Ja Morant', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1629630.webp', 10500),
  ('三等獎', 'Jalen Brunson', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1628973.webp', 10500),
  ('三等獎', 'Paolo Banchero', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1631094.webp', 10500),
  ('三等獎', 'Desmond Bane', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1630173.webp', 10500),
  ('三等獎', 'Devin Booker', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1626164.webp', 10500),
  ('三等獎', 'Pascal Siakam', 'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot/nba/1627783.webp', 10500)
) AS v(level, name, img, val);

-- 五台機台共用同一份獎池（庫存共用，與絕頂RUSH 相同設計）
INSERT INTO public.slot_pool_items
  (machine_id, product_prize_id, weight, rush_only, normal_only, coin_return, is_floor, min_bet)
SELECT m.id, pp.id, 1, TRUE, FALSE, FALSE, FALSE,
       (regexp_replace(p.name, '.*\((\d+)\)$', '\1'))::int
FROM public.slot_machines m
JOIN public.slot_themes t ON t.id = m.theme_id AND t.name = '灌籃SLAM DUNK'
CROSS JOIN public.products p
JOIN public.product_prizes pp ON pp.product_id = p.id
WHERE p.type='slot' AND p.name LIKE '灌籃SLAM DUNK(%)';

COMMIT;