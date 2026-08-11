-- 一番賞／抽卡／自製賞：清空重建的前半段（刪除）
--
-- ⚠ draw_records.product_id 的外鍵是 **SET NULL 不是 CASCADE** ——
--   刪商品不會刪抽獎紀錄，只會把 product_id 清空，留下一堆孤兒，
--   而那些孤兒在 token_ledger 裡仍記著「扣過錢」。
BEGIN;

-- ① 先修既有的孤兒：那是我先前刪商品時誤以為會連帶刪除、已經退過款的紀錄。
--    錢已經還了、扣款紀錄卻還在 → 玩家餘額比帳目多。刪掉紀錄才對得起來，
--    這裡**不能再退一次**。
DELETE FROM draw_records WHERE product_id IS NULL AND COALESCE(tokens_spent, 0) > 0;

-- ② 這次要刪的商品：抽獎紀錄先退款再刪。
--    刪掉紀錄等於 draw_total 少掉那筆，帳目上的應有餘額會變高，
--    所以要同額加回 users.tokens，兩邊才一致。
WITH t AS (
  SELECT d.user_id, SUM(COALESCE(d.tokens_spent, 0)) AS amt
  FROM draw_records d JOIN products p ON p.id = d.product_id
  WHERE p.type IN ('ichiban', 'card', 'custom')
  GROUP BY d.user_id
)
UPDATE users u SET tokens = u.tokens + t.amt FROM t WHERE u.id = t.user_id AND t.amt > 0;

DELETE FROM draw_records d USING products p
 WHERE p.id = d.product_id AND p.type IN ('ichiban', 'card', 'custom');

-- ③ 刪商品（品項、封存、排籤計畫等走 CASCADE）
DELETE FROM products WHERE type IN ('ichiban', 'card', 'custom');

COMMIT;
