-- Add logistics columns to orders table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS logistics_type VARCHAR(20) DEFAULT 'HOME', -- 'HOME' or 'CVS'
ADD COLUMN IF NOT EXISTS logistics_subtype VARCHAR(20), -- 'UNIMART', 'FAMI', 'HILIFE', 'OKMART'
ADD COLUMN IF NOT EXISTS store_id VARCHAR(50),
ADD COLUMN IF NOT EXISTS store_name VARCHAR(100);

-- Update status check if needed (it seems flexible enough already)
-- status is VARCHAR(20) with check constraint.
-- Let's check if we need to add more statuses.
-- current: 'submitted', 'processing', 'picked_up', 'shipping', 'delivered', 'cancelled'
-- 'picked_up' is good for when logistics company picks it up.
