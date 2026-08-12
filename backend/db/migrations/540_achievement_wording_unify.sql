-- 名詞統一：站上不再有「蛋」的專屬名詞，一律講「抽獎」
--
-- 平台有四種商品（轉蛋／一番賞／盒玩／抽卡），「轉蛋」是其中一個品類，
-- 不能拿來當「抽一次」的通稱 —— 玩家在一番賞頁面看到「累積完成 100 次轉蛋」
-- 會以為那個成就只算轉蛋商品。任務、徽章、稱號的文案一律改成「抽獎」。
--
-- 商品分類本身的「轉蛋」保留不動，那是正確用法。

UPDATE badges SET name = '抽獎成癮' WHERE name = '轉蛋成癮';
UPDATE badges SET description = REPLACE(description, '轉蛋', '抽獎') WHERE description LIKE '%轉蛋%';

UPDATE tasks  SET title = '抽獎之神' WHERE title = '抽蛋之神';
UPDATE tasks  SET description = REPLACE(description, '轉蛋', '抽獎') WHERE description LIKE '%轉蛋%';
UPDATE tasks  SET description = REPLACE(description, '抽蛋', '抽獎') WHERE description LIKE '%抽蛋%';

UPDATE titles SET name = '抽獎狂熱者' WHERE name = '轉蛋狂熱者';
