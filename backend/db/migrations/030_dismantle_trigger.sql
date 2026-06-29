BEGIN;

-- Function to calculate recycle value
CREATE OR REPLACE FUNCTION calculate_recycle_value() RETURNS TRIGGER AS $$
DECLARE
  v_product_price INTEGER;
BEGIN
  -- Get product price
  SELECT price INTO v_product_price FROM products WHERE id = NEW.product_id;
  
  -- If product not found (shouldn't happen due to FK), default to 0
  v_product_price := COALESCE(v_product_price, 0);

  -- Apply logic: 
  -- If total quantity is 1-4 (High Tier), value is 2x product price
  -- Otherwise (Low Tier), value is 50
  IF NEW.total > 0 AND NEW.total <= 4 THEN
    NEW.recycle_value := v_product_price * 2;
  ELSE
    NEW.recycle_value := 50;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger
DROP TRIGGER IF EXISTS set_recycle_value_trigger ON product_prizes;
CREATE TRIGGER set_recycle_value_trigger
BEFORE INSERT OR UPDATE OF total, product_id ON product_prizes
FOR EACH ROW
EXECUTE FUNCTION calculate_recycle_value();

-- Re-run update for existing records to ensure consistency
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
