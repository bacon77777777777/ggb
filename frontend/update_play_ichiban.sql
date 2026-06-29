-- 1. 確保 draw_records 資料表有必要的欄位
DO $$
BEGIN
    -- 如果 status 欄位不存在，則新增
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'draw_records' AND column_name = 'status') THEN
        ALTER TABLE draw_records ADD COLUMN status VARCHAR(50) DEFAULT 'in_warehouse';
    END IF;

    -- 如果 product_prize_id 欄位不存在，則新增
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'draw_records' AND column_name = 'product_prize_id') THEN
        ALTER TABLE draw_records ADD COLUMN product_prize_id BIGINT;
    END IF;
END $$;

-- 2. 更新 play_ichiban 函數 (移除 profiles 依賴，修正 UUID 比對)
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

  -- 檢查用戶餘額 (僅查詢 users 表)
  SELECT tokens INTO v_user_tokens FROM users WHERE id = v_user_id;
  
  -- 移除對 profiles 的查詢，避免 "relation profiles does not exist" 錯誤
  -- IF v_user_tokens IS NULL THEN
  --    SELECT points INTO v_user_tokens FROM profiles WHERE id = v_user_id;
  -- END IF;

  IF v_user_tokens IS NULL OR v_user_tokens < v_total_cost THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  -- 扣除餘額 (僅更新 users 表)
  UPDATE users SET tokens = tokens - v_total_cost WHERE id = v_user_id;
  
  -- 移除對 profiles 的更新
  -- UPDATE profiles SET points = points - v_total_cost WHERE id = v_user_id;

  FOREACH v_ticket_no IN ARRAY p_ticket_numbers LOOP
    -- 檢查票是否已售出
    IF EXISTS (SELECT 1 FROM draw_records WHERE product_id = p_product_id AND ticket_number = v_ticket_no) THEN
        RAISE EXCEPTION 'Ticket % is already sold', v_ticket_no;
    END IF;

    -- 隨機抽取獎品 (排除 Last One)
    SELECT * INTO v_prize FROM product_prizes 
    WHERE product_id = p_product_id AND remaining > 0 AND level != 'Last One' AND level != 'LAST ONE'
    ORDER BY random() * probability DESC
    LIMIT 1;

    IF v_prize IS NULL THEN
      RAISE EXCEPTION 'No prizes left';
    END IF;

    -- 扣庫存
    UPDATE product_prizes SET remaining = remaining - 1 WHERE id = v_prize.id;
    UPDATE products SET remaining = remaining - 1 WHERE id = p_product_id;

    -- 產生隨機參數
    v_seed := md5(random()::text || clock_timestamp()::text);
    v_nonce := floor(random() * 1000000)::int;
    v_hash := md5(v_seed || v_nonce::text);
    v_random := random();

    -- 寫入抽獎紀錄
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

    -- 加入結果
    v_prizes_drawn := v_prizes_drawn || jsonb_build_object(
      'grade', v_prize.level,
      'name', v_prize.name,
      'image_url', v_prize.image_url
    );

    -- 檢查是否觸發 Last One
    SELECT COALESCE(SUM(remaining), 0) INTO v_normal_qty FROM product_prizes 
    WHERE product_id = p_product_id AND level != 'Last One' AND level != 'LAST ONE';
    
    IF v_normal_qty = 0 THEN
        SELECT * INTO v_last_one_prize FROM product_prizes 
        WHERE product_id = p_product_id AND (level = 'Last One' OR level = 'LAST ONE') AND remaining > 0
        LIMIT 1;

        IF v_last_one_prize IS NOT NULL THEN
            UPDATE product_prizes SET remaining = 0 WHERE id = v_last_one_prize.id;
            UPDATE products SET remaining = 0 WHERE id = p_product_id;

            v_seed := md5(random()::text || clock_timestamp()::text);
            v_nonce := floor(random() * 1000000)::int;
            v_hash := md5(v_seed || v_nonce::text);
            v_random := random();

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

-- 3. 自動修復舊資料
UPDATE draw_records
SET 
  status = 'in_warehouse',
  product_prize_id = product_prizes.id
FROM product_prizes
WHERE 
  draw_records.product_id = product_prizes.product_id 
  AND draw_records.prize_level = product_prizes.level 
  AND draw_records.prize_name = product_prizes.name
  AND (draw_records.status IS NULL OR draw_records.product_prize_id IS NULL);
