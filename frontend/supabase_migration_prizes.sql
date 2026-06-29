-- Add total_count column to prizes table to track initial quantity
-- This is necessary for calculating probabilities correctly (Remaining / Total)
ALTER TABLE public.prizes 
ADD COLUMN IF NOT EXISTS total_count INTEGER DEFAULT 0;

-- Update existing records to have total_count = quantity (assuming they are currently full or we use current as base)
-- This prevents division by zero or logic errors in legacy data
UPDATE public.prizes 
SET total_count = quantity 
WHERE total_count = 0;
