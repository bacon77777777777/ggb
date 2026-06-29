-- 1. Add recipient fields to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS recipient_name TEXT,
ADD COLUMN IF NOT EXISTS recipient_phone TEXT,
ADD COLUMN IF NOT EXISTS recipient_address TEXT;

-- 2. Add status to draw_history
ALTER TABLE public.draw_history 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'in_warehouse'; -- 'in_warehouse', 'shipped', 'exchanged'

-- 3. Create delivery_orders table
CREATE TABLE IF NOT EXISTS public.delivery_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles ON DELETE CASCADE,
  status TEXT DEFAULT 'pending', -- 'pending', 'shipping', 'completed', 'cancelled'
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  recipient_address TEXT NOT NULL,
  tracking_number TEXT,
  shipping_method TEXT DEFAULT 'standard',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create follows table
CREATE TABLE IF NOT EXISTS public.follows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles ON DELETE CASCADE,
  product_id UUID REFERENCES public.products ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

-- 5. Link draw_history to delivery_orders
ALTER TABLE public.draw_history
ADD COLUMN IF NOT EXISTS delivery_order_id UUID REFERENCES public.delivery_orders ON DELETE SET NULL;

-- 6. Enable RLS for new tables
ALTER TABLE public.delivery_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- Policies for delivery_orders
CREATE POLICY "Users can view own delivery orders" ON public.delivery_orders
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own delivery orders" ON public.delivery_orders
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policies for follows
CREATE POLICY "Users can view own follows" ON public.follows
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own follows" ON public.follows
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own follows" ON public.follows
  FOR DELETE USING (auth.uid() = user_id);

-- Update RLS for draw_history to allow update (for requesting delivery)
DROP POLICY IF EXISTS "Users can update own draw history" ON public.draw_history;
CREATE POLICY "Users can update own draw history" ON public.draw_history
  FOR UPDATE USING (auth.uid() = user_id);
