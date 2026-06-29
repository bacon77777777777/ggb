SELECT column_name, data_type, is_nullable, column_default, is_identity
FROM information_schema.columns
WHERE table_name = 'product_prizes';
