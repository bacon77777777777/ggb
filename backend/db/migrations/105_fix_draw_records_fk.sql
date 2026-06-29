-- Fix draw_records schema and RLS
-- 1. Enable RLS and add policy
ALTER TABLE draw_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all access for all users" ON draw_records;
CREATE POLICY "Enable all access for all users"
ON draw_records
FOR ALL
USING (true)
WITH CHECK (true);

-- 2. Fix FK to users
-- Ensure user_id is linked to public.users(id)
ALTER TABLE draw_records DROP CONSTRAINT IF EXISTS draw_records_user_id_fkey;

-- We assume draw_records.user_id is UUID. If not, this might need type conversion, 
-- but based on migration 003 it should be UUID.
ALTER TABLE draw_records
  ADD CONSTRAINT draw_records_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES public.users (id)
  ON DELETE SET NULL;

-- 3. Fix FK to products (just in case)
ALTER TABLE draw_records DROP CONSTRAINT IF EXISTS draw_records_product_id_fkey;

ALTER TABLE draw_records
  ADD CONSTRAINT draw_records_product_id_fkey
  FOREIGN KEY (product_id)
  REFERENCES products (id)
  ON DELETE SET NULL;
