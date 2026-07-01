-- series 欄位只允許 IP 名稱，不允許商品形式類別
-- 移除 migration 212 錯誤加入的兜底分類

-- 清空非 IP series
UPDATE products SET series = NULL
WHERE series IN ('盒玩', '雜貨', '模型', '一番賞', 'Cassette');

-- 一番賞商品補正確 IP
UPDATE products SET series = '防風少年'
WHERE name ILIKE '%防風少年%' AND (series IS NULL OR series = '');

-- 清掉 series_keywords 裡的形式類別 keyword
DELETE FROM series_keywords WHERE series_name = '一番賞';
DELETE FROM series_keywords WHERE keyword = 'cassette';
