-- Enable Realtime for products and product_prizes tables
BEGIN;

-- Check if publication exists, if not create it (standard Supabase setup usually has it)
-- We'll just try to add tables to it. 
-- Note: 'supabase_realtime' is the default publication name in Supabase.

-- Enable replication for products
ALTER TABLE products REPLICA IDENTITY FULL;
-- Enable replication for product_prizes
ALTER TABLE product_prizes REPLICA IDENTITY FULL;

-- Add tables to the publication
-- We use a DO block to avoid errors if they are already added or if the publication doesn't exist (though it should)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'products'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE products;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'product_prizes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE product_prizes;
  END IF;
END $$;

COMMIT;
