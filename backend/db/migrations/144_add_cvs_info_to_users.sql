-- Add CVS Logistics Info to Users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS cvs_store_id TEXT,
ADD COLUMN IF NOT EXISTS cvs_store_name TEXT,
ADD COLUMN IF NOT EXISTS cvs_store_address TEXT,
ADD COLUMN IF NOT EXISTS cvs_recipient_name TEXT,
ADD COLUMN IF NOT EXISTS cvs_recipient_phone TEXT;
