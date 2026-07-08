-- Migration 294: 商品新增日幣定價與特價欄位
ALTER TABLE products ADD COLUMN IF NOT EXISTS jp_price_yen INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS special_price INTEGER;

INSERT INTO dev_logs (type, title, content, created_at)
VALUES ('migration', 'Migration 294：products 新增 jp_price_yen / special_price',
  '智能批量匯入需儲存日幣定價（供售價自動換算）與特價（促銷用）', NOW());
