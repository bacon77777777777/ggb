-- Fix product_follows table schema mismatch
-- The products table uses BIGINT for id, but product_follows was incorrectly defined with UUID for product_id.

-- 1. Drop the incorrect table if it exists
DROP TABLE IF EXISTS public.product_follows;

-- 2. Recreate with correct types
CREATE TABLE public.product_follows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id BIGINT REFERENCES public.products(id) ON DELETE CASCADE, -- Changed to BIGINT to match products.id
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

-- 3. Enable RLS
ALTER TABLE public.product_follows ENABLE ROW LEVEL SECURITY;

-- 4. Re-create Policies
-- Policy: Users can view their own follows
CREATE POLICY "Users can view own follows" ON public.product_follows
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert their own follows
CREATE POLICY "Users can insert own follows" ON public.product_follows
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own follows
CREATE POLICY "Users can delete own follows" ON public.product_follows
  FOR DELETE USING (auth.uid() = user_id);
