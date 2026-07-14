-- 商品名稱欄位從 VARCHAR(50) 改為 TEXT，避免日文長名稱寫入失敗
DROP VIEW IF EXISTS vw_top3_products_by_traffic;

ALTER TABLE public.products ALTER COLUMN name TYPE TEXT;
ALTER TABLE public.products ALTER COLUMN category TYPE TEXT;
ALTER TABLE public.products ALTER COLUMN product_code TYPE TEXT;

CREATE OR REPLACE VIEW vw_top3_products_by_traffic AS
SELECT p.id AS product_id, p.name AS product_name, p.product_code, p.status AS product_status,
       count(dr.id) AS draw_count
FROM draw_records dr
JOIN products p ON dr.product_id = p.id
JOIN users u ON dr.user_id = u.id
WHERE (u.is_bot IS NULL OR u.is_bot = false)
GROUP BY p.id, p.name, p.product_code, p.status
ORDER BY count(dr.id) DESC
LIMIT 3;
