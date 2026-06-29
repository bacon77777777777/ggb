-- 1. Ensure shipment_requests table exists (if not already created)
CREATE TABLE IF NOT EXISTS public.shipment_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'shipped', 'completed', 'cancelled')),
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  recipient_address TEXT NOT NULL,
  tracking_number TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.shipment_requests ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Users can view their own shipment requests" ON public.shipment_requests;
CREATE POLICY "Users can view their own shipment requests"
  ON public.shipment_requests FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create shipment requests" ON public.shipment_requests;
CREATE POLICY "Users can create shipment requests"
  ON public.shipment_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 2. Link draw_history to shipment_requests
-- Assuming draw_history already has delivery_order_id, we add a Foreign Key constraint
-- If the column doesn't exist, add it
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'draw_history' AND column_name = 'delivery_order_id') THEN
        ALTER TABLE public.draw_history ADD COLUMN delivery_order_id UUID;
    END IF;
END $$;

-- Add FK constraint (safely)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_draw_history_shipment') THEN
        ALTER TABLE public.draw_history 
        ADD CONSTRAINT fk_draw_history_shipment 
        FOREIGN KEY (delivery_order_id) 
        REFERENCES public.shipment_requests(id)
        ON DELETE SET NULL;
    END IF;
END $$;
