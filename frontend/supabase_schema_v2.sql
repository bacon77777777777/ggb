-- 1. Add Recipient Info to Profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS recipient_name TEXT,
ADD COLUMN IF NOT EXISTS recipient_phone TEXT,
ADD COLUMN IF NOT EXISTS recipient_address TEXT;

-- 2. Add Status to Draw History (Inventory)
ALTER TABLE public.draw_history
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'in_warehouse'; -- 'in_warehouse', 'pending_delivery', 'shipped', 'exchanged'

-- 3. Delivery Orders
CREATE TABLE IF NOT EXISTS public.delivery_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles ON DELETE CASCADE,
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  recipient_address TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- 'pending', 'shipping', 'completed', 'cancelled'
  tracking_number TEXT,
  shipping_method TEXT DEFAULT 'standard',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Link Draw History items to Delivery Order
ALTER TABLE public.draw_history
ADD COLUMN IF NOT EXISTS delivery_order_id UUID REFERENCES public.delivery_orders ON DELETE SET NULL;

-- 5. Product Follows
CREATE TABLE IF NOT EXISTS public.product_follows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles ON DELETE CASCADE,
  product_id UUID REFERENCES public.products ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

-- 6. Enable RLS for new tables
ALTER TABLE public.delivery_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_follows ENABLE ROW LEVEL SECURITY;

-- Policies for Delivery Orders
CREATE POLICY "Users can view own delivery orders" ON public.delivery_orders
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own delivery orders" ON public.delivery_orders
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policies for Product Follows
CREATE POLICY "Users can view own follows" ON public.product_follows
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own follows" ON public.product_follows
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own follows" ON public.product_follows
  FOR DELETE USING (auth.uid() = user_id);
