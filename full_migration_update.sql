-- Fix play_ichiban function to use correct tables and columns
CREATE OR REPLACE FUNCTION public.play_ichiban(p_product_id BIGINT, p_ticket_numbers INTEGER[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_product_price INTEGER;
  v_prize RECORD;
  v_last_one_prize RECORD;
  v_prizes_drawn JSONB := '[]'::jsonb;
  v_ticket_no INTEGER;
  v_count INTEGER;
  v_normal_qty INTEGER;
  v_seed TEXT;
  v_nonce INTEGER;
  v_hash TEXT;
  v_random NUMERIC;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT price INTO v_product_price FROM products WHERE id = p_product_id;
  IF v_product_price IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  v_count := array_length(p_ticket_numbers, 1);
  IF v_count IS NULL OR v_count = 0 THEN
     RAISE EXCEPTION 'No tickets selected';
  END IF;

  FOREACH v_ticket_no IN ARRAY p_ticket_numbers LOOP
    -- Check if ticket is already taken
    IF EXISTS (SELECT 1 FROM draw_records WHERE product_id = p_product_id AND ticket_number = v_ticket_no) THEN
        RAISE EXCEPTION 'Ticket % is already sold', v_ticket_no;
    END IF;

    -- Pick a random prize (EXCLUDING Last One)
    SELECT * INTO v_prize FROM product_prizes 
    WHERE product_id = p_product_id AND remaining > 0 AND level != 'Last One' AND level != 'LAST ONE'
    ORDER BY random() * probability DESC
    LIMIT 1;

    IF v_prize IS NULL THEN
      RAISE EXCEPTION 'No prizes left';
    END IF;

    -- Decrement quantity
    UPDATE product_prizes SET remaining = remaining - 1 WHERE id = v_prize.id;
    UPDATE products SET remaining = remaining - 1 WHERE id = p_product_id;

    -- Generate TXID data
    v_seed := md5(random()::text || clock_timestamp()::text);
    v_nonce := floor(random() * 1000000)::int;
    v_hash := md5(v_seed || v_nonce::text);
    v_random := random();

    -- Record in draw_records
    INSERT INTO draw_records (
        user_id, product_id, ticket_number, prize_level, prize_name,
        txid_seed, txid_nonce, txid_hash, random_value, profit_rate
    )
    VALUES (
        v_user_id, p_product_id, v_ticket_no, v_prize.level, v_prize.name,
        v_seed, v_nonce, v_hash, v_random, 1.0
    );

    -- Add to result
    v_prizes_drawn := v_prizes_drawn || jsonb_build_object(
      'grade', v_prize.level,
      'name', v_prize.name,
      'image_url', v_prize.image_url
    );

    -- Check if this was the last normal prize
    SELECT COALESCE(SUM(remaining), 0) INTO v_normal_qty FROM product_prizes 
    WHERE product_id = p_product_id AND level != 'Last One' AND level != 'LAST ONE';
    
    -- If no normal prizes left, award Last One
    IF v_normal_qty = 0 THEN
        SELECT * INTO v_last_one_prize FROM product_prizes 
        WHERE product_id = p_product_id AND (level = 'Last One' OR level = 'LAST ONE') AND remaining > 0
        LIMIT 1;

        IF v_last_one_prize IS NOT NULL THEN
            -- Update Last One quantity
            UPDATE product_prizes SET remaining = 0 WHERE id = v_last_one_prize.id;
            
            -- Force product remaining to 0
            UPDATE products SET remaining = 0 WHERE id = p_product_id;

            -- Generate TXID for Last One
            v_seed := md5(random()::text || clock_timestamp()::text);
            v_nonce := floor(random() * 1000000)::int;
            v_hash := md5(v_seed || v_nonce::text);
            v_random := random();

            -- Record Last One in draw_records
            -- Use -1 or special ticket number for Last One? 
            -- Existing code used 'LAST_ONE' string for ticket_no, but ticket_number is INTEGER.
            -- We'll use 0 or -1. Let's use 0 as ticket numbers usually start from 1.
            INSERT INTO draw_records (
                user_id, product_id, ticket_number, prize_level, prize_name,
                txid_seed, txid_nonce, txid_hash, random_value, profit_rate
            )
            VALUES (
                v_user_id, p_product_id, 0, v_last_one_prize.level, v_last_one_prize.name,
                v_seed, v_nonce, v_hash, v_random, 1.0
            );

            -- Add to result
            v_prizes_drawn := v_prizes_drawn || jsonb_build_object(
              'grade', v_last_one_prize.level,
              'name', v_last_one_prize.name,
              'image_url', v_last_one_prize.image_url,
              'is_last_one', true
            );
        END IF;
    END IF;

  END LOOP;

  RETURN v_prizes_drawn;
END;
$$;
-- Fix play_ichiban function to deduct user points and record warehouse items correctly
CREATE OR REPLACE FUNCTION public.play_ichiban(p_product_id BIGINT, p_ticket_numbers INTEGER[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_user_tokens INTEGER;
  v_product_price INTEGER;
  v_total_cost INTEGER;
  v_prize RECORD;
  v_last_one_prize RECORD;
  v_prizes_drawn JSONB := '[]'::jsonb;
  v_ticket_no INTEGER;
  v_count INTEGER;
  v_normal_qty INTEGER;
  v_seed TEXT;
  v_nonce INTEGER;
  v_hash TEXT;
  v_random NUMERIC;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT price INTO v_product_price FROM products WHERE id = p_product_id;
  IF v_product_price IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  v_count := array_length(p_ticket_numbers, 1);
  IF v_count IS NULL OR v_count = 0 THEN
     RAISE EXCEPTION 'No tickets selected';
  END IF;

  v_total_cost := v_product_price * v_count;

  -- Check user balance
  SELECT tokens INTO v_user_tokens FROM users WHERE id = v_user_id::text;
  
  IF v_user_tokens IS NULL THEN
     -- Try fetching from profiles if users table entry missing
     SELECT points INTO v_user_tokens FROM profiles WHERE id = v_user_id;
  END IF;

  IF v_user_tokens IS NULL OR v_user_tokens < v_total_cost THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  -- Deduct balance
  UPDATE users SET tokens = tokens - v_total_cost WHERE id = v_user_id::text;
  
  -- Also update profiles if it exists, to keep in sync
  UPDATE profiles SET points = points - v_total_cost WHERE id = v_user_id;

  FOREACH v_ticket_no IN ARRAY p_ticket_numbers LOOP
    -- Check if ticket is already taken
    IF EXISTS (SELECT 1 FROM draw_records WHERE product_id = p_product_id AND ticket_number = v_ticket_no) THEN
        RAISE EXCEPTION 'Ticket % is already sold', v_ticket_no;
    END IF;

    -- Pick a random prize (EXCLUDING Last One)
    SELECT * INTO v_prize FROM product_prizes 
    WHERE product_id = p_product_id AND remaining > 0 AND level != 'Last One' AND level != 'LAST ONE'
    ORDER BY random() * probability DESC
    LIMIT 1;

    IF v_prize IS NULL THEN
      RAISE EXCEPTION 'No prizes left';
    END IF;

    -- Decrement quantity
    UPDATE product_prizes SET remaining = remaining - 1 WHERE id = v_prize.id;
    UPDATE products SET remaining = remaining - 1 WHERE id = p_product_id;

    -- Generate TXID data
    v_seed := md5(random()::text || clock_timestamp()::text);
    v_nonce := floor(random() * 1000000)::int;
    v_hash := md5(v_seed || v_nonce::text);
    v_random := random();

    -- Record in draw_records
    INSERT INTO draw_records (
        user_id, product_id, ticket_number, prize_level, prize_name,
        txid_seed, txid_nonce, txid_hash, random_value, profit_rate,
        product_prize_id, status
    )
    VALUES (
        v_user_id, p_product_id, v_ticket_no, v_prize.level, v_prize.name,
        v_seed, v_nonce, v_hash, v_random, 1.0,
        v_prize.id, 'in_warehouse'
    );

    -- Add to result
    v_prizes_drawn := v_prizes_drawn || jsonb_build_object(
      'grade', v_prize.level,
      'name', v_prize.name,
      'image_url', v_prize.image_url
    );

    -- Check if this was the last normal prize
    SELECT COALESCE(SUM(remaining), 0) INTO v_normal_qty FROM product_prizes 
    WHERE product_id = p_product_id AND level != 'Last One' AND level != 'LAST ONE';
    
    -- If no normal prizes left, award Last One
    IF v_normal_qty = 0 THEN
        SELECT * INTO v_last_one_prize FROM product_prizes 
        WHERE product_id = p_product_id AND (level = 'Last One' OR level = 'LAST ONE') AND remaining > 0
        LIMIT 1;

        IF v_last_one_prize IS NOT NULL THEN
            -- Update Last One quantity
            UPDATE product_prizes SET remaining = 0 WHERE id = v_last_one_prize.id;
            
            -- Force product remaining to 0
            UPDATE products SET remaining = 0 WHERE id = p_product_id;

            -- Generate TXID for Last One
            v_seed := md5(random()::text || clock_timestamp()::text);
            v_nonce := floor(random() * 1000000)::int;
            v_hash := md5(v_seed || v_nonce::text);
            v_random := random();

            -- Record Last One in draw_records
            INSERT INTO draw_records (
                user_id, product_id, ticket_number, prize_level, prize_name,
                txid_seed, txid_nonce, txid_hash, random_value, profit_rate,
                product_prize_id, status
            )
            VALUES (
                v_user_id, p_product_id, 0, v_last_one_prize.level, v_last_one_prize.name,
                v_seed, v_nonce, v_hash, v_random, 1.0,
                v_last_one_prize.id, 'in_warehouse'
            );

            -- Add to result
            v_prizes_drawn := v_prizes_drawn || jsonb_build_object(
              'grade', v_last_one_prize.level,
              'name', v_last_one_prize.name,
              'image_url', v_last_one_prize.image_url,
              'is_last_one', true
            );
        END IF;
    END IF;

  END LOOP;

  RETURN v_prizes_drawn;
END;
$$;

-- Fix existing draw_records that are missing status or product_prize_id
UPDATE draw_records dr
SET 
  status = 'in_warehouse',
  product_prize_id = pp.id
FROM product_prizes pp
WHERE 
  dr.product_id = pp.product_id 
  AND dr.prize_level = pp.level 
  AND dr.prize_name = pp.name
  AND (dr.status IS NULL OR dr.product_prize_id IS NULL);
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
-- Marketplace & Recycle Pool System
-- Combined script for P2P Auction and Dismantle Tracking

-- ==========================================
-- Part 1: Marketplace System
-- ==========================================

-- 1. Add is_tradable column to draw_records
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'draw_records' AND column_name = 'is_tradable') THEN
        ALTER TABLE draw_records ADD COLUMN is_tradable BOOLEAN DEFAULT true;
    END IF;
END $$;

-- 2. Update status constraint to include 'listing'
DO $$
DECLARE
    r RECORD;
BEGIN
    SELECT conname INTO r
    FROM pg_constraint 
    WHERE conrelid = 'draw_records'::regclass 
    AND contype = 'c' 
    AND pg_get_constraintdef(oid) LIKE '%status%';
    IF FOUND THEN
        EXECUTE 'ALTER TABLE draw_records DROP CONSTRAINT ' || r.conname;
    END IF;
    ALTER TABLE draw_records ADD CONSTRAINT draw_records_status_check 
    CHECK (status IN ('in_warehouse', 'pending_delivery', 'shipped', 'exchanged', 'dismantled', 'listing'));
END $$;

-- 3. Create Marketplace Listings Table
CREATE TABLE IF NOT EXISTS marketplace_listings (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    seller_id UUID NOT NULL REFERENCES users(id),
    draw_record_id BIGINT NOT NULL REFERENCES draw_records(id),
    price INTEGER NOT NULL CHECK (price > 0),
    status VARCHAR(20) NOT NULL CHECK (status IN ('active', 'sold', 'cancelled')) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create Marketplace Transactions Table (Log)
CREATE TABLE IF NOT EXISTS marketplace_transactions (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    listing_id BIGINT REFERENCES marketplace_listings(id),
    buyer_id UUID REFERENCES users(id),
    seller_id UUID REFERENCES users(id),
    draw_record_id BIGINT REFERENCES draw_records(id),
    price INTEGER NOT NULL,
    fee INTEGER NOT NULL,
    seller_receive INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Function: Create Listing
CREATE OR REPLACE FUNCTION create_listing(
    p_record_id BIGINT,
    p_price INTEGER,
    p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
    v_record RECORD;
BEGIN
    -- Check ownership and status
    SELECT * INTO v_record FROM draw_records 
    WHERE id = p_record_id AND user_id = p_user_id;

    IF v_record IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Item not found or access denied');
    END IF;

    IF v_record.status != 'in_warehouse' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Item is not in warehouse');
    END IF;

    IF v_record.is_tradable = false THEN
        RETURN jsonb_build_object('success', false, 'message', 'Item is bound and cannot be traded');
    END IF;

    -- Update record status
    UPDATE draw_records SET status = 'listing' WHERE id = p_record_id;

    -- Create listing
    INSERT INTO marketplace_listings (seller_id, draw_record_id, price)
    VALUES (p_user_id, p_record_id, p_price);

    RETURN jsonb_build_object('success', true, 'message', 'Listing created');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Function: Cancel Listing
CREATE OR REPLACE FUNCTION cancel_listing(
    p_listing_id BIGINT,
    p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
    v_listing RECORD;
BEGIN
    SELECT * INTO v_listing FROM marketplace_listings 
    WHERE id = p_listing_id AND seller_id = p_user_id AND status = 'active';

    IF v_listing IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Listing not found or not active');
    END IF;

    -- Update listing status
    UPDATE marketplace_listings SET status = 'cancelled', updated_at = NOW() WHERE id = p_listing_id;

    -- Return item to warehouse
    UPDATE draw_records SET status = 'in_warehouse' WHERE id = v_listing.draw_record_id;

    RETURN jsonb_build_object('success', true, 'message', 'Listing cancelled');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Function: Purchase Listing
CREATE OR REPLACE FUNCTION purchase_listing(
    p_listing_id BIGINT,
    p_buyer_id UUID
) RETURNS JSONB AS $$
DECLARE
    v_listing RECORD;
    v_buyer_tokens INTEGER;
    v_fee INTEGER;
    v_seller_receive INTEGER;
BEGIN
    -- Get listing info
    SELECT * INTO v_listing FROM marketplace_listings 
    WHERE id = p_listing_id AND status = 'active';

    IF v_listing IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Listing not found or no longer active');
    END IF;

    IF v_listing.seller_id = p_buyer_id THEN
        RETURN jsonb_build_object('success', false, 'message', 'Cannot buy your own listing');
    END IF;

    -- Check buyer balance
    SELECT tokens INTO v_buyer_tokens FROM users WHERE id = p_buyer_id;
    
    IF v_buyer_tokens < v_listing.price THEN
        RETURN jsonb_build_object('success', false, 'message', 'Insufficient tokens');
    END IF;

    -- Calculate fee (5%)
    v_fee := FLOOR(v_listing.price * 0.05);
    v_seller_receive := v_listing.price - v_fee;

    -- Process Transaction
    -- 1. Deduct from buyer
    UPDATE users SET tokens = tokens - v_listing.price WHERE id = p_buyer_id;

    -- 2. Add to seller
    UPDATE users SET tokens = tokens + v_seller_receive WHERE id = v_listing.seller_id;

    -- 3. Update Listing
    UPDATE marketplace_listings SET status = 'sold', updated_at = NOW() WHERE id = p_listing_id;

    -- 4. Transfer Item Ownership and Mark as Bound (Not Tradable)
    UPDATE draw_records 
    SET user_id = p_buyer_id, 
        status = 'in_warehouse',
        is_tradable = false  -- BINDING LOGIC
    WHERE id = v_listing.draw_record_id;

    -- 5. Log Transaction
    INSERT INTO marketplace_transactions (listing_id, buyer_id, seller_id, draw_record_id, price, fee, seller_receive)
    VALUES (p_listing_id, p_buyer_id, v_listing.seller_id, v_listing.draw_record_id, v_listing.price, v_fee, v_seller_receive);

    RETURN jsonb_build_object('success', true, 'message', 'Purchase successful');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Enable RLS
ALTER TABLE marketplace_listings ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can view active listings
DROP POLICY IF EXISTS "View active listings" ON marketplace_listings;
CREATE POLICY "View active listings" ON marketplace_listings
FOR SELECT USING (status = 'active' OR seller_id = auth.uid());

-- Policy: Sellers can update their own listings (for cancellation logic mainly handled by RPC but good for safety)
DROP POLICY IF EXISTS "Sellers manage listings" ON marketplace_listings;
CREATE POLICY "Sellers manage listings" ON marketplace_listings
FOR ALL USING (seller_id = auth.uid());


-- ==========================================
-- Part 2: Recycle Pool System (Admin Table)
-- ==========================================

-- 1. Create Recycle Pool Table
CREATE TABLE IF NOT EXISTS admin_recycle_pool (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    product_prize_id BIGINT NOT NULL REFERENCES product_prizes(id),
    original_draw_record_id BIGINT REFERENCES draw_records(id),
    dismantled_at TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR(20) NOT NULL CHECK (status IN ('available', 'reused')) DEFAULT 'available',
    reused_at TIMESTAMPTZ
);

-- 2. Enable RLS (Admin Only - simplified for now, usually needs admin role check)
ALTER TABLE admin_recycle_pool ENABLE ROW LEVEL SECURITY;

-- 3. Update dismantle_prizes function to feed the pool
CREATE OR REPLACE FUNCTION dismantle_prizes(
  p_record_ids BIGINT[],
  p_user_id UUID
) RETURNS TABLE (
  success_count INTEGER,
  total_refund INTEGER
) AS $$
DECLARE
  v_record RECORD;
  v_refund INTEGER := 0;
  v_count INTEGER := 0;
  v_prize_value INTEGER;
BEGIN
  FOR v_record IN 
    SELECT dr.id, dr.product_prize_id, pp.recycle_value
    FROM draw_records dr
    JOIN product_prizes pp ON dr.product_prize_id = pp.id
    WHERE dr.id = ANY(p_record_ids)
      AND dr.user_id = p_user_id
      AND dr.status = 'in_warehouse'
  LOOP
    v_prize_value := COALESCE(v_record.recycle_value, 0);
    IF v_prize_value > 0 THEN
      -- 1. Update Draw Record
      UPDATE draw_records SET status = 'dismantled' WHERE id = v_record.id;
      
      -- 2. Insert into Recycle Pool
      INSERT INTO admin_recycle_pool (product_prize_id, original_draw_record_id)
      VALUES (v_record.product_prize_id, v_record.id);
      
      -- 3. Calculate Refund
      v_refund := v_refund + v_prize_value;
      v_count := v_count + 1;
    END IF;
  END LOOP;
  
  -- 4. Refund User
  IF v_refund > 0 THEN
    UPDATE users SET tokens = tokens + v_refund WHERE id = p_user_id;
  END IF;
  
  RETURN QUERY SELECT v_count, v_refund;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- Create daily_check_ins table
CREATE TABLE IF NOT EXISTS daily_check_ins (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    check_in_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    reward_amount INTEGER DEFAULT 10,
    CONSTRAINT unique_daily_check_in UNIQUE (user_id, check_in_date)
);

-- RLS Policies
ALTER TABLE daily_check_ins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own check-ins" ON daily_check_ins;
CREATE POLICY "Users can view their own check-ins"
    ON daily_check_ins FOR SELECT
    USING (auth.uid() = user_id);

-- Function to handle daily check-in
CREATE OR REPLACE FUNCTION daily_check_in(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_last_check_in DATE;
    v_consecutive_days INTEGER;
    v_reward INTEGER := 10; -- Base reward
    v_bonus INTEGER := 0;
BEGIN
    -- Check if already checked in today
    IF EXISTS (
        SELECT 1 FROM daily_check_ins 
        WHERE user_id = p_user_id AND check_in_date = CURRENT_DATE
    ) THEN
        RETURN jsonb_build_object(
            'success', false, 
            'message', '今日已簽到'
        );
    END IF;

    -- Calculate consecutive days (simplified logic for now)
    -- This is a placeholder for more complex logic if needed
    
    -- Insert check-in record
    INSERT INTO daily_check_ins (user_id, check_in_date, reward_amount)
    VALUES (p_user_id, CURRENT_DATE, v_reward);

    -- Update user tokens
    UPDATE users 
    SET tokens = COALESCE(tokens, 0) + v_reward
    WHERE id = p_user_id;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Check-in successful',
        'reward', v_reward
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get check-in status (last 7 days)
CREATE OR REPLACE FUNCTION get_check_in_status(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_check_ins JSONB;
    v_today_checked BOOLEAN;
BEGIN
    SELECT jsonb_agg(jsonb_build_object(
        'date', check_in_date,
        'reward', reward_amount
    ))
    INTO v_check_ins
    FROM (
        SELECT check_in_date, reward_amount
        FROM daily_check_ins
        WHERE user_id = p_user_id
        ORDER BY check_in_date DESC
        LIMIT 7
    ) t;

    SELECT EXISTS (
        SELECT 1 FROM daily_check_ins 
        WHERE user_id = p_user_id AND check_in_date = CURRENT_DATE
    ) INTO v_today_checked;

    RETURN jsonb_build_object(
        'history', COALESCE(v_check_ins, '[]'::jsonb),
        'today_checked', v_today_checked
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS for marketplace_transactions
ALTER TABLE marketplace_transactions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view transactions where they are the buyer or seller
DROP POLICY IF EXISTS "View own transactions" ON marketplace_transactions;
CREATE POLICY "View own transactions" ON marketplace_transactions
FOR SELECT USING (auth.uid() = buyer_id OR auth.uid() = seller_id);
