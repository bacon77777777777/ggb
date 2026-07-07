-- 新增產品條碼欄位（EAN-13、JAN、UPC 等通用）
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode VARCHAR(50);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products (barcode) WHERE barcode IS NOT NULL;
