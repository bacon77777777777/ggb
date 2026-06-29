-- Create Coupons and Referrals tables

-- 1. Coupons Table
CREATE TABLE IF NOT EXISTS public.coupons (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    code TEXT UNIQUE, -- Optional, for manual entry codes
    title TEXT NOT NULL,
    description TEXT,
    discount_type TEXT NOT NULL CHECK (discount_type IN ('fixed', 'percentage')),
    discount_value NUMERIC NOT NULL,
    min_spend NUMERIC DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for coupons
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can view active coupons (or at least authenticated users)
CREATE POLICY "Coupons are viewable by everyone" 
ON public.coupons FOR SELECT 
USING (true);

-- 2. User Coupons Table
CREATE TABLE IF NOT EXISTS public.user_coupons (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    coupon_id UUID REFERENCES public.coupons(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('unused', 'used', 'expired')) DEFAULT 'unused',
    used_at TIMESTAMPTZ,
    expiry_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for user_coupons
ALTER TABLE public.user_coupons ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own coupons
CREATE POLICY "Users can view own coupons" 
ON public.user_coupons FOR SELECT 
USING (auth.uid() = user_id);

-- 3. Referrals Table
CREATE TABLE IF NOT EXISTS public.referrals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    referrer_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    referee_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'completed',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(referee_id) -- A user can only be referred once
);

-- Enable RLS for referrals
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view referrals where they are involved
CREATE POLICY "Users can view own referrals" 
ON public.referrals FOR SELECT 
USING (auth.uid() = referrer_id OR auth.uid() = referee_id);

-- 4. Insert default Referral Coupon
INSERT INTO public.coupons (code, title, description, discount_type, discount_value, min_spend)
VALUES ('REFERRAL_REWARD', '好友推薦獎勵', '成功邀請好友獲得的獎勵', 'fixed', 50, 0)
ON CONFLICT (code) DO NOTHING;

-- 5. Update handle_new_user function to process referral
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    invite_code_input text;
    referrer_id_found uuid;
    referral_coupon_id uuid;
BEGIN
    -- 1. Insert into public.users (existing logic)
    INSERT INTO public.users (id, email, name, invite_code)
    VALUES (
        new.id, 
        new.email, 
        new.raw_user_meta_data->>'name',
        public.generate_invite_code()
    );

    -- 2. Check for invite code in metadata
    invite_code_input := new.raw_user_meta_data->>'invite_code';
    
    IF invite_code_input IS NOT NULL AND invite_code_input <> '' THEN
        -- Find referrer
        SELECT id INTO referrer_id_found FROM public.users WHERE invite_code = invite_code_input LIMIT 1;
        
        IF referrer_id_found IS NOT NULL THEN
            -- Create referral record
            INSERT INTO public.referrals (referrer_id, referee_id)
            VALUES (referrer_id_found, new.id);
            
            -- Find the referral coupon
            SELECT id INTO referral_coupon_id FROM public.coupons WHERE code = 'REFERRAL_REWARD' LIMIT 1;
            
            IF referral_coupon_id IS NOT NULL THEN
                -- Give coupon to Referrer
                INSERT INTO public.user_coupons (user_id, coupon_id, status, expiry_date)
                VALUES (referrer_id_found, referral_coupon_id, 'unused', NOW() + INTERVAL '30 days');
                
                -- OPTIONAL: Give coupon to Referee (New User) - per user instruction "The other party gets coupon", implying referrer. 
                -- If we want to reward the new user too, uncomment below:
                -- INSERT INTO public.user_coupons (user_id, coupon_id, status, expiry_date)
                -- VALUES (new.id, referral_coupon_id, 'unused', NOW() + INTERVAL '30 days');
            END IF;
        END IF;
    END IF;

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
