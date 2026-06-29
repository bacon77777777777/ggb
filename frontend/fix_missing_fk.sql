-- Add foreign key constraint to draw_records for product_prize_id
DO $$
BEGIN
    -- Check if the constraint already exists to avoid error
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_draw_records_product_prizes' 
        AND table_name = 'draw_records'
    ) THEN
        ALTER TABLE draw_records
        ADD CONSTRAINT fk_draw_records_product_prizes
        FOREIGN KEY (product_prize_id)
        REFERENCES product_prizes(id);
    END IF;
END $$;

-- Reload PostgREST schema cache to recognize the new relationship
NOTIFY pgrst, 'reload config';
