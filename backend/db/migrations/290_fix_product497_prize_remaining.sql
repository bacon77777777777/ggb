-- Migration 290: 修復 product 497（迪士尼麵包吊飾）prize remaining 不同步問題
-- 原因：GB哥 updateProductStock 更新了 products.remaining = 5，
--       但 product_prizes.remaining 全部 = 0（prize 更新靜默失敗）
-- 修復：將 5 個獎項各設 remaining = 1（5 × 1 = 5 = products.remaining）

UPDATE product_prizes
SET remaining = 1
WHERE product_id = 497
  AND remaining = 0;

-- 驗證
SELECT p.id, p.remaining AS product_remaining,
       SUM(pp.remaining) AS prize_remaining_sum,
       COUNT(pp.id) AS prize_count
FROM products p
JOIN product_prizes pp ON pp.product_id = p.id
WHERE p.id = 497
GROUP BY p.id, p.remaining;
