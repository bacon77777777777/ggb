-- Fix RLS for coupons table to allow admin panel operations

-- Ensure table exists
CREATE TABLE IF NOT EXISTS public.coupons (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    code TEXT UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    discount_type TEXT NOT NULL CHECK (discount_type IN ('fixed', 'percentage')),
    discount_value NUMERIC NOT NULL,
    min_spend NUMERIC DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- Drop old policies to avoid conflicts
DROP POLICY IF EXISTS "Coupons are viewable by everyone" ON public.coupons;
DROP POLICY IF EXISTS "Allow public read access" ON public.coupons;
DROP POLICY IF EXISTS "Allow public insert access" ON public.coupons;
DROP POLICY IF EXISTS "Allow public update access" ON public.coupons;
DROP POLICY IF EXISTS "Allow public delete access" ON public.coupons;

-- Create permissive policies (admin panel uses anon key)
CREATE POLICY "Allow public read access"
ON public.coupons FOR SELECT
USING (true);

CREATE POLICY "Allow public insert access"
ON public.coupons FOR INSERT
WITH CHECK (true);

CREATE POLICY "Allow public update access"
ON public.coupons FOR UPDATE
USING (true);

CREATE POLICY "Allow public delete access"
ON public.coupons FOR DELETE
USING (true);

-- Reload PostgREST schema
NOTIFY pgrst, 'reload schema';

