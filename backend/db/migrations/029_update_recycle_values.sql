BEGIN;

-- Update recycle_value based on prize quantity (total)
-- If total <= 4 (and > 0), set to product price * 2
-- Else set to 50

UPDATE product_prizes pp
SET recycle_value = CASE 
  WHEN pp.total > 0 AND pp.total <= 4 THEN (
    SELECT COALESCE(p.price, 0) * 2 
    FROM products p 
    WHERE p.id = pp.product_id
  )
  ELSE 50
END;

COMMIT;
