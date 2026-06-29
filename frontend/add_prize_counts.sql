
-- Add total_count and remaining_count columns to prizes table if they don't exist
ALTER TABLE public.prizes ADD COLUMN IF NOT EXISTS total_count INTEGER DEFAULT 0;
ALTER TABLE public.prizes ADD COLUMN IF NOT EXISTS remaining_count INTEGER DEFAULT 0;

-- Update existing records to set total_count and remaining_count from quantity
UPDATE public.prizes SET total_count = quantity WHERE total_count = 0;
UPDATE public.prizes SET remaining_count = quantity WHERE remaining_count = 0;
