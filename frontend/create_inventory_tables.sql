-- Create user_inventory table
CREATE TABLE IF NOT EXISTS public.user_inventory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  prize_id UUID REFERENCES public.prizes(id) NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'shipping_requested', 'shipped', 'exchanged')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for user_inventory
ALTER TABLE public.user_inventory ENABLE ROW LEVEL SECURITY;

-- Create policies for user_inventory
DROP POLICY IF EXISTS "Users can view their own inventory" ON public.user_inventory;
CREATE POLICY "Users can view their own inventory"
  ON public.user_inventory FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own inventory" ON public.user_inventory;
CREATE POLICY "Users can update their own inventory"
  ON public.user_inventory FOR UPDATE
  USING (auth.uid() = user_id);

-- Create shipment_requests table
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

-- Enable RLS for shipment_requests
ALTER TABLE public.shipment_requests ENABLE ROW LEVEL SECURITY;

-- Create policies for shipment_requests
DROP POLICY IF EXISTS "Users can view their own shipment requests" ON public.shipment_requests;
CREATE POLICY "Users can view their own shipment requests"
  ON public.shipment_requests FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create shipment requests" ON public.shipment_requests;
CREATE POLICY "Users can create shipment requests"
  ON public.shipment_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create shipment_items junction table (to link multiple inventory items to one shipment)
CREATE TABLE IF NOT EXISTS public.shipment_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shipment_id UUID REFERENCES public.shipment_requests(id) ON DELETE CASCADE NOT NULL,
  inventory_id UUID REFERENCES public.user_inventory(id) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for shipment_items
ALTER TABLE public.shipment_items ENABLE ROW LEVEL SECURITY;

-- Create policies for shipment_items
DROP POLICY IF EXISTS "Users can view their own shipment items" ON public.shipment_items;
CREATE POLICY "Users can view their own shipment items"
  ON public.shipment_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.shipment_requests
      WHERE public.shipment_requests.id = shipment_items.shipment_id
      AND public.shipment_requests.user_id = auth.uid()
    )
  );
