-- Ensure admins table email column is fully removed.
-- Safe idempotent: only drops if column exists.
ALTER TABLE public.admins DROP COLUMN IF EXISTS email;
