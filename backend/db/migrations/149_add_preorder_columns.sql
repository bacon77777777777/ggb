-- Add preorder columns to products
BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_preorder BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS preorder_available_at TIMESTAMPTZ;

COMMIT;

