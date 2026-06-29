-- Recalculate recycle_value for all existing product_prizes
-- Rule:
-- Quantity 1-4: recycle_value = product price * 2
-- Others: recycle_value = 50

UPDATE product_prizes pp
SET recycle_value = (
  CASE 
    WHEN pp.quantity BETWEEN 1 AND 4 THEN (
      SELECT p.price * 2 
      FROM products p 
      WHERE p.id = pp.product_id
    )
    ELSE 50
  END
);
