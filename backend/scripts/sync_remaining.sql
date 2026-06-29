-- Sync products.remaining = sum of normal prize remaining
UPDATE products p
SET remaining = COALESCE((
  SELECT SUM(remaining)
  FROM product_prizes pr
  WHERE pr.product_id = p.id
    AND (pr.level NOT ILIKE 'last one' AND pr.level NOT LIKE '%最後賞%')
), 0);

