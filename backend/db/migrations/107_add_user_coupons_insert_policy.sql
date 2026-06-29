-- Allow users to insert their own coupons into user_coupons

ALTER TABLE public.user_coupons ENABLE ROW LEVEL SECURITY;

-- Drop existing insert policy if any to avoid conflicts
DROP POLICY IF EXISTS "Users can insert own coupons" ON public.user_coupons;

CREATE POLICY "Users can insert own coupons"
ON public.user_coupons
FOR INSERT
WITH CHECK (auth.uid() = user_id);

