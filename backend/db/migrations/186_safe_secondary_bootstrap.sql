-- 185_safe_secondary_bootstrap.sql
-- Safe idempotent bootstrap for secondary tables.
-- Uses CREATE TABLE IF NOT EXISTS + ALTER TABLE ADD COLUMN IF NOT EXISTS.
-- Does NOT drop or truncate any table. Safe to run on existing data.

BEGIN;

-- =========================================================
-- 1. Users: invite code + referral trigger
-- =========================================================

CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS text AS $$
DECLARE
  chars text[] := '{0,1,2,3,4,5,6,7,8,9,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z}';
  result text := '';
  i integer := 0;
  done bool := false;
  collision_check text;
BEGIN
  WHILE NOT done LOOP
    result := '';
    FOR i IN 1..6 LOOP
      result := result || chars[1+floor(random()*(array_length(chars, 1)))::integer];
    END LOOP;
    SELECT id INTO collision_check FROM public.users WHERE invite_code = result;
    IF collision_check IS NULL THEN done := true; END IF;
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS invite_code TEXT;

-- Backfill existing users without invite_code
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.users WHERE invite_code IS NULL LOOP
    UPDATE public.users SET invite_code = public.generate_invite_code() WHERE id = r.id;
  END LOOP;
END $$;

-- Add unique constraint only if column has no nulls now
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'users' AND constraint_name = 'users_invite_code_key'
  ) THEN
    BEGIN
      ALTER TABLE public.users ADD CONSTRAINT users_invite_code_key UNIQUE (invite_code);
    EXCEPTION WHEN others THEN NULL; END;
  END IF;
END $$;

-- =========================================================
-- 2. Coupons & Referrals
-- =========================================================

CREATE TABLE IF NOT EXISTS public.coupons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  discount_type TEXT NOT NULL DEFAULT 'fixed' CHECK (discount_type IN ('fixed', 'percentage')),
  discount_value NUMERIC NOT NULL DEFAULT 0,
  min_spend NUMERIC DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Coupons are viewable by everyone" ON public.coupons;
CREATE POLICY "Coupons are viewable by everyone" ON public.coupons FOR SELECT USING (TRUE);

CREATE TABLE IF NOT EXISTS public.user_coupons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  coupon_id UUID REFERENCES public.coupons(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'unused' CHECK (status IN ('unused', 'used', 'expired')),
  used_at TIMESTAMPTZ,
  expiry_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_coupons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own coupons" ON public.user_coupons;
CREATE POLICY "Users can view own coupons" ON public.user_coupons FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own coupons" ON public.user_coupons;
CREATE POLICY "Users can insert own coupons" ON public.user_coupons FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  referee_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(referee_id)
);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own referrals" ON public.referrals;
CREATE POLICY "Users can view own referrals" ON public.referrals FOR SELECT
  USING (auth.uid() = referrer_id OR auth.uid() = referee_id);

INSERT INTO public.coupons (code, title, description, discount_type, discount_value, min_spend)
VALUES ('REFERRAL_REWARD', '好友推薦獎勵', '成功邀請好友獲得的獎勵', 'fixed', 50, 0)
ON CONFLICT (code) DO NOTHING;

-- Updated handle_new_user with invite code + referral logic
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  invite_code_input text;
  referrer_id_found uuid;
  referral_coupon_id uuid;
BEGIN
  INSERT INTO public.users (id, email, name, invite_code)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'name',
    public.generate_invite_code()
  )
  ON CONFLICT (id) DO NOTHING;

  invite_code_input := new.raw_user_meta_data->>'invite_code';
  IF invite_code_input IS NOT NULL AND invite_code_input <> '' THEN
    SELECT id INTO referrer_id_found FROM public.users WHERE invite_code = invite_code_input LIMIT 1;
    IF referrer_id_found IS NOT NULL THEN
      INSERT INTO public.referrals (referrer_id, referee_id)
      VALUES (referrer_id_found, new.id)
      ON CONFLICT (referee_id) DO NOTHING;
      SELECT id INTO referral_coupon_id FROM public.coupons WHERE code = 'REFERRAL_REWARD' LIMIT 1;
      IF referral_coupon_id IS NOT NULL THEN
        INSERT INTO public.user_coupons (user_id, coupon_id, status, expiry_date)
        VALUES (referrer_id_found, referral_coupon_id, 'unused', NOW() + INTERVAL '30 days');
      END IF;
    END IF;
  END IF;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================
-- 3. Tags & Menu Products (from 157_split_menus_and_tags)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  pinned_order INTEGER NOT NULL DEFAULT 0,
  is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_tags_name_ci ON public.tags ((lower(name)));

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access for all users" ON public.tags;
CREATE POLICY "Enable all access for all users" ON public.tags FOR ALL USING (TRUE) WITH CHECK (TRUE);

CREATE TABLE IF NOT EXISTS public.product_tag_links (
  product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, tag_id)
);

ALTER TABLE public.product_tag_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access for all users" ON public.product_tag_links;
CREATE POLICY "Enable all access for all users" ON public.product_tag_links FOR ALL USING (TRUE) WITH CHECK (TRUE);

CREATE TABLE IF NOT EXISTS public.menu_products (
  menu_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (menu_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_menu_products_menu ON public.menu_products(menu_id, sort_order DESC, created_at DESC);

ALTER TABLE public.menu_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access for all users" ON public.menu_products;
CREATE POLICY "Enable all access for all users" ON public.menu_products FOR ALL USING (TRUE) WITH CHECK (TRUE);

CREATE TABLE IF NOT EXISTS public.product_view_events (
  event_date DATE NOT NULL DEFAULT CURRENT_DATE,
  user_id UUID NOT NULL,
  product_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_date, user_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.tag_daily_stats (
  stat_date DATE NOT NULL DEFAULT CURRENT_DATE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  views INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (stat_date, tag_id)
);

-- =========================================================
-- 4. Mission / Task System
-- =========================================================

CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'daily' CHECK (type IN ('daily', 'weekly', 'achievement')),
  title TEXT NOT NULL,
  description TEXT,
  target_value INTEGER NOT NULL DEFAULT 1,
  reward_coins INTEGER NOT NULL DEFAULT 0,
  condition_type TEXT NOT NULL DEFAULT 'login' CHECK (condition_type IN ('login', 'draw_count', 'spend_amount', 'share_app')),
  icon_name TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tasks are viewable by everyone" ON public.tasks;
CREATE POLICY "Tasks are viewable by everyone" ON public.tasks FOR SELECT USING (TRUE);

CREATE TABLE IF NOT EXISTS public.user_task_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  progress INTEGER DEFAULT 0,
  is_completed BOOLEAN DEFAULT FALSE,
  is_claimed BOOLEAN DEFAULT FALSE,
  period_key TEXT NOT NULL,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_task_period UNIQUE (user_id, task_id, period_key)
);

ALTER TABLE public.user_task_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own progress" ON public.user_task_progress;
CREATE POLICY "Users can view own progress" ON public.user_task_progress FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own progress" ON public.user_task_progress;
CREATE POLICY "Users can update own progress" ON public.user_task_progress FOR ALL USING (auth.uid() = user_id);

-- =========================================================
-- 5. draw_records extra columns for marketplace
-- =========================================================

ALTER TABLE public.draw_records ADD COLUMN IF NOT EXISTS is_tradable BOOLEAN DEFAULT TRUE;
ALTER TABLE public.draw_records ADD COLUMN IF NOT EXISTS is_last_one BOOLEAN DEFAULT FALSE;

-- Safely update status constraint to include marketplace states
DO $$
DECLARE r RECORD;
BEGIN
  SELECT conname INTO r
  FROM pg_constraint
  WHERE conrelid = 'public.draw_records'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status%';
  IF FOUND THEN
    EXECUTE 'ALTER TABLE public.draw_records DROP CONSTRAINT ' || r.conname;
  END IF;
END $$;

ALTER TABLE public.draw_records ADD CONSTRAINT draw_records_status_check
  CHECK (status IN ('success', 'in_warehouse', 'pending_delivery', 'shipped', 'exchanged', 'dismantled', 'listing', 'cancelled'));

-- =========================================================
-- 6. Marketplace (custodial listings system)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.marketplace_listings (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  seller_id UUID NOT NULL REFERENCES public.users(id),
  draw_record_id BIGINT REFERENCES public.draw_records(id),
  price INTEGER NOT NULL CHECK (price > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold', 'cancelled')),
  note TEXT,
  images TEXT[] DEFAULT ARRAY[]::TEXT[],
  -- extra fields from 172
  shopee_url TEXT,
  external_platform TEXT,
  -- extra fields from 173
  title TEXT,
  item_type TEXT DEFAULT 'draw_prize',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Marketplace listings viewable by all" ON public.marketplace_listings;
CREATE POLICY "Marketplace listings viewable by all" ON public.marketplace_listings FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS "Marketplace listings manageable by seller" ON public.marketplace_listings;
CREATE POLICY "Marketplace listings manageable by seller" ON public.marketplace_listings
  FOR ALL USING (auth.uid() = seller_id) WITH CHECK (auth.uid() = seller_id);

CREATE TABLE IF NOT EXISTS public.marketplace_transactions (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  listing_id BIGINT REFERENCES public.marketplace_listings(id),
  buyer_id UUID REFERENCES public.users(id),
  seller_id UUID REFERENCES public.users(id),
  draw_record_id BIGINT REFERENCES public.draw_records(id),
  price INTEGER NOT NULL,
  fee INTEGER NOT NULL DEFAULT 0,
  seller_receive INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.marketplace_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Marketplace transactions: parties can view" ON public.marketplace_transactions;
CREATE POLICY "Marketplace transactions: parties can view" ON public.marketplace_transactions
  FOR SELECT USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

-- Non-custodial marketplace (from 175+)
CREATE TABLE IF NOT EXISTS public.marketplace_seller_profiles (
  seller_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  transfer_bank TEXT,
  transfer_account TEXT,
  transfer_name TEXT,
  private_trade_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.marketplace_seller_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Marketplace seller profiles - seller manage" ON public.marketplace_seller_profiles;
CREATE POLICY "Marketplace seller profiles - seller manage"
  ON public.marketplace_seller_profiles FOR ALL
  USING (seller_id = auth.uid()) WITH CHECK (seller_id = auth.uid());
-- "buyer view via order" policy is added after marketplace_orders is created (below)

CREATE TABLE IF NOT EXISTS public.marketplace_orders (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  listing_id BIGINT NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES public.users(id),
  buyer_id UUID NOT NULL REFERENCES public.users(id),
  item_index INTEGER NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price INTEGER NOT NULL DEFAULT 0 CHECK (unit_price > 0),
  payment_method TEXT NOT NULL DEFAULT 'transfer' CHECK (payment_method IN ('transfer', 'private')),
  step INTEGER NOT NULL DEFAULT 1 CHECK (step BETWEEN 1 AND 6),
  cancelled BOOLEAN NOT NULL DEFAULT FALSE,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.marketplace_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Marketplace orders: parties can view" ON public.marketplace_orders;
CREATE POLICY "Marketplace orders: parties can view"
  ON public.marketplace_orders FOR SELECT
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id);
DROP POLICY IF EXISTS "Marketplace orders: buyer can insert" ON public.marketplace_orders;
CREATE POLICY "Marketplace orders: buyer can insert"
  ON public.marketplace_orders FOR INSERT
  WITH CHECK (auth.uid() = buyer_id);
DROP POLICY IF EXISTS "Marketplace orders: parties can update" ON public.marketplace_orders;
CREATE POLICY "Marketplace orders: parties can update"
  ON public.marketplace_orders FOR UPDATE
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

-- Now add the deferred seller profile policy that references marketplace_orders
DROP POLICY IF EXISTS "Marketplace seller profiles - buyer view via order" ON public.marketplace_seller_profiles;
CREATE POLICY "Marketplace seller profiles - buyer view via order"
  ON public.marketplace_seller_profiles FOR SELECT
  USING (
    seller_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.marketplace_orders o
      WHERE o.seller_id = marketplace_seller_profiles.seller_id
        AND o.buyer_id = auth.uid()
        AND o.cancelled = FALSE
    )
  );

CREATE TABLE IF NOT EXISTS public.marketplace_messages (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  listing_id BIGINT NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  order_id BIGINT REFERENCES public.marketplace_orders(id) ON DELETE SET NULL,
  sender_id UUID NOT NULL REFERENCES public.users(id),
  receiver_id UUID NOT NULL REFERENCES public.users(id),
  kind TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'system')),
  body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.marketplace_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Marketplace messages: parties can view" ON public.marketplace_messages;
CREATE POLICY "Marketplace messages: parties can view"
  ON public.marketplace_messages FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
DROP POLICY IF EXISTS "Marketplace messages: authenticated can insert" ON public.marketplace_messages;
CREATE POLICY "Marketplace messages: authenticated can insert"
  ON public.marketplace_messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

-- =========================================================
-- 7. Exchange System (from 162-170)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.exchange_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'deleted')),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS exchange_offers_owner_id_idx ON public.exchange_offers (owner_id);
CREATE INDEX IF NOT EXISTS exchange_offers_status_created_at_idx ON public.exchange_offers (status, created_at DESC);

ALTER TABLE public.exchange_offers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Exchange offers: public can view active, owner can view all" ON public.exchange_offers;
CREATE POLICY "Exchange offers: public can view active, owner can view all"
  ON public.exchange_offers FOR SELECT
  USING (status = 'active' OR auth.uid() = owner_id);
DROP POLICY IF EXISTS "Exchange offers: owner can insert" ON public.exchange_offers;
CREATE POLICY "Exchange offers: owner can insert"
  ON public.exchange_offers FOR INSERT
  WITH CHECK (auth.uid() = owner_id);
DROP POLICY IF EXISTS "Exchange offers: owner can update" ON public.exchange_offers;
CREATE POLICY "Exchange offers: owner can update"
  ON public.exchange_offers FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE TABLE IF NOT EXISTS public.exchange_offer_cards (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  offer_id UUID NOT NULL REFERENCES public.exchange_offers(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('want', 'give')),
  external_id TEXT NOT NULL,
  name TEXT NOT NULL,
  series TEXT,
  image_url TEXT,
  value INTEGER NOT NULL DEFAULT 0,
  position SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (offer_id, side, position)
);

CREATE INDEX IF NOT EXISTS exchange_offer_cards_offer_id_idx ON public.exchange_offer_cards (offer_id);
ALTER TABLE public.exchange_offer_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Exchange offer cards: public can view active offer cards" ON public.exchange_offer_cards;
CREATE POLICY "Exchange offer cards: public can view active offer cards"
  ON public.exchange_offer_cards FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.exchange_offers o
      WHERE o.id = exchange_offer_cards.offer_id
        AND (o.status = 'active' OR o.owner_id = auth.uid())
    )
  );
DROP POLICY IF EXISTS "Exchange offer cards: owner can manage" ON public.exchange_offer_cards;
CREATE POLICY "Exchange offer cards: owner can manage"
  ON public.exchange_offer_cards FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.exchange_offers o WHERE o.id = offer_id AND o.owner_id = auth.uid())
  );

CREATE TABLE IF NOT EXISTS public.exchange_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID NOT NULL REFERENCES public.exchange_offers(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  initiator_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  step SMALLINT NOT NULL DEFAULT 1,
  confirmations JSONB NOT NULL DEFAULT '{}'::jsonb,
  recipient JSONB DEFAULT '{}'::jsonb,
  tracking_numbers JSONB NOT NULL DEFAULT '{}'::jsonb,
  receipt_media JSONB DEFAULT '{}'::jsonb,
  ratings JSONB NOT NULL DEFAULT '{}'::jsonb,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  cancelled BOOLEAN NOT NULL DEFAULT FALSE,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS exchange_orders_offer_one_active_idx
  ON public.exchange_orders (offer_id)
  WHERE done = FALSE AND cancelled = FALSE;

CREATE INDEX IF NOT EXISTS exchange_orders_owner_id_updated_at_idx ON public.exchange_orders (owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS exchange_orders_initiator_id_updated_at_idx ON public.exchange_orders (initiator_id, updated_at DESC);

ALTER TABLE public.exchange_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Exchange orders: parties can view" ON public.exchange_orders;
CREATE POLICY "Exchange orders: parties can view"
  ON public.exchange_orders FOR SELECT
  USING (auth.uid() = owner_id OR auth.uid() = initiator_id);
DROP POLICY IF EXISTS "Exchange orders: parties can update" ON public.exchange_orders;
CREATE POLICY "Exchange orders: parties can update"
  ON public.exchange_orders FOR UPDATE
  USING (auth.uid() = owner_id OR auth.uid() = initiator_id);

CREATE TABLE IF NOT EXISTS public.exchange_messages (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  offer_id UUID NOT NULL REFERENCES public.exchange_offers(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.exchange_orders(id) ON DELETE SET NULL,
  sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'system', 'offer')),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS exchange_messages_offer_id_created_at_idx ON public.exchange_messages (offer_id, created_at DESC);
ALTER TABLE public.exchange_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Exchange messages: parties can view" ON public.exchange_messages;
CREATE POLICY "Exchange messages: parties can view"
  ON public.exchange_messages FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
DROP POLICY IF EXISTS "Exchange messages: authenticated can send" ON public.exchange_messages;
CREATE POLICY "Exchange messages: authenticated can send"
  ON public.exchange_messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

CREATE TABLE IF NOT EXISTS public.exchange_offer_activation_codes (
  offer_id UUID PRIMARY KEY REFERENCES public.exchange_offers(id) ON DELETE CASCADE,
  code TEXT NOT NULL CHECK (code ~ '^[0-9]{4}$'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.exchange_offer_activation_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Exchange activation codes: owner can view" ON public.exchange_offer_activation_codes;
CREATE POLICY "Exchange activation codes: owner can view"
  ON public.exchange_offer_activation_codes FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.exchange_offers o
      WHERE o.id = exchange_offer_activation_codes.offer_id
        AND o.owner_id = auth.uid()
    )
  );

-- Realtime for exchange
ALTER TABLE public.exchange_messages REPLICA IDENTITY FULL;
ALTER TABLE public.exchange_orders REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'exchange_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.exchange_messages;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'exchange_orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.exchange_orders;
  END IF;
END $$;

-- Storage bucket for exchange receipts
INSERT INTO storage.buckets (id, name, public)
VALUES ('exchange-receipts', 'exchange-receipts', TRUE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Exchange Receipts Read" ON storage.objects;
CREATE POLICY "Exchange Receipts Read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'exchange-receipts');

DROP POLICY IF EXISTS "Exchange Receipts Write" ON storage.objects;
CREATE POLICY "Exchange Receipts Write"
  ON storage.objects FOR ALL
  USING (bucket_id = 'exchange-receipts' AND auth.role() = 'authenticated')
  WITH CHECK (bucket_id = 'exchange-receipts' AND auth.role() = 'authenticated');

-- Activation code trigger for exchange offers
CREATE OR REPLACE FUNCTION public.ensure_exchange_offer_activation_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_code text;
BEGIN
  IF EXISTS (SELECT 1 FROM exchange_offer_activation_codes c WHERE c.offer_id = NEW.id) THEN
    RETURN NEW;
  END IF;
  v_code := lpad(((floor(random() * 10000))::int)::text, 4, '0');
  INSERT INTO exchange_offer_activation_codes (offer_id, code) VALUES (NEW.id, v_code);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_exchange_offer_activation_code ON public.exchange_offers;
CREATE TRIGGER trg_exchange_offer_activation_code
  AFTER INSERT ON public.exchange_offers
  FOR EACH ROW EXECUTE FUNCTION public.ensure_exchange_offer_activation_code();

-- =========================================================
-- 8. Admin recycle pool (referenced by admin tools)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.admin_recycle_pool (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  draw_record_id BIGINT REFERENCES public.draw_records(id) ON DELETE SET NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  product_id BIGINT REFERENCES public.products(id) ON DELETE SET NULL,
  prize_name TEXT,
  prize_level TEXT,
  recycle_value INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================
-- Done
-- =========================================================

NOTIFY pgrst, 'reload schema';

COMMIT;
