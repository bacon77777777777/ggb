
-- Migration 024: Migrate prizes to product_prizes
-- Purpose: Unify prize data into product_prizes table and ensure data consistency

-- Copy data from prizes to product_prizes
-- Mapping:
-- grade -> level
-- quantity -> total
-- quantity -> remaining (since draw_history is empty)
-- probability -> probability
-- product_id -> product_id
-- name -> name
-- image_url -> image_url

INSERT INTO product_prizes (product_id, level, name, image_url, total, remaining, probability, created_at)
SELECT 
  product_id, 
  grade, 
  name, 
  image_url, 
  quantity, 
  quantity,
  probability, 
  created_at
FROM prizes
WHERE NOT EXISTS (
    SELECT 1 FROM product_prizes 
    WHERE product_prizes.product_id = prizes.product_id 
    AND product_prizes.level = prizes.grade
);

-- Optional: We could drop prizes table later, but for now we keep it.
