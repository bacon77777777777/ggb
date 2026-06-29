-- Add missing columns to products table
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS major_prizes text[] DEFAULT ARRAY['A賞', 'Last One'],
ADD COLUMN IF NOT EXISTS distributor text,
ADD COLUMN IF NOT EXISTS rarity integer DEFAULT 3,
ADD COLUMN IF NOT EXISTS txid_hash text,
ADD COLUMN IF NOT EXISTS seed text,
ADD COLUMN IF NOT EXISTS ended_at timestamp with time zone;

-- Update RLS policies to allow update on these columns if needed
-- (Existing policies usually allow UPDATE on all columns for admin)
