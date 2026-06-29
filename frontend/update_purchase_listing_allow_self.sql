-- Fix purchase_listing function to allow self-purchase
-- While retaining the fee deduction and warehouse return logic

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

    -- REMOVED: Check for self-purchase
    -- IF v_listing.seller_id = p_buyer_id THEN
    --    RETURN jsonb_build_object('success', false, 'message', 'Cannot buy your own listing');
    -- END IF;

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
