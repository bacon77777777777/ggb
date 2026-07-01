-- 204_add_preorder_fields.sql
-- 新增預購相關欄位到 products 表

BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_preorder BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS preorder_available_at TIMESTAMP WITH TIME ZONE;

COMMIT;
