-- Add order_id to draw_records (Corrected type to BIGINT)
ALTER TABLE draw_records 
ADD COLUMN IF NOT EXISTS order_id BIGINT REFERENCES orders(id);
