-- 修補 TEST 訂單：payment_method 從 'other' 改為 'test'，金額改為 amount=0, bonus=total
-- 並更新 token_ledger view：manual 類型 description 不再含英文 "by"

UPDATE recharge_records
SET payment_method = 'test',
    bonus = amount + COALESCE(bonus, 0),
    amount = 0
WHERE order_number LIKE 'TEST%'
  AND payment_method = 'other';
