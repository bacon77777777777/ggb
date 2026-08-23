-- 605: PROD 函數 catch-up（老闆 2026-08-24 宅配報 delivery_has_large_item 不存在）
--
-- 「上線後開發只跑 STG、推正時才補 PROD」的政策下漏補的一批：對 STG↔PROD 做全函數 diff，
-- STG 有、PROD 沒有的 14 顆函數與 3 條 exchange 通知 trigger，從 STG pg_get_functiondef 原樣搬過來。
-- 內容都是 CREATE OR REPLACE FUNCTION / CREATE TRIGGER，無資料操作。表結構兩邊本來就一致。

CREATE OR REPLACE FUNCTION public.admin_clear_market_and_recycle_pool()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_reset_records INTEGER := 0;
  v_deleted_transactions INTEGER := 0;
  v_deleted_listings INTEGER := 0;
  v_deleted_recycle INTEGER := 0;
BEGIN
  UPDATE draw_records
  SET status = 'in_warehouse'
  WHERE status = 'listing'
    AND id IN (SELECT draw_record_id FROM marketplace_listings);

  GET DIAGNOSTICS v_reset_records = ROW_COUNT;

  DELETE FROM marketplace_transactions;
  GET DIAGNOSTICS v_deleted_transactions = ROW_COUNT;

  DELETE FROM marketplace_listings;
  GET DIAGNOSTICS v_deleted_listings = ROW_COUNT;

  DELETE FROM admin_recycle_pool;
  GET DIAGNOSTICS v_deleted_recycle = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'reset_records', v_reset_records,
    'deleted_transactions', v_deleted_transactions,
    'deleted_listings', v_deleted_listings,
    'deleted_recycle', v_deleted_recycle
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.calc_delivery_fee(p_logistics_type text, p_logistics_subtype text, p_item_count integer, p_has_large boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_threshold INTEGER;
  v_key       TEXT;
  v_fee       TEXT;
BEGIN
  -- 免運門檻依物流分開；沒設定就退回舊的單一門檻
  SELECT value::INTEGER INTO v_threshold FROM public.platform_settings
   WHERE key = CASE WHEN p_logistics_type = 'CVS'
                    THEN 'free_shipping_threshold_cvs'
                    ELSE 'free_shipping_threshold_home' END;
  IF v_threshold IS NULL THEN
    SELECT value::INTEGER INTO v_threshold FROM public.platform_settings
     WHERE key = 'free_shipping_threshold';
  END IF;

  -- 大件一律不免運：一箱真實成本就超過門檻能攤提的範圍
  IF NOT COALESCE(p_has_large, FALSE)
     AND v_threshold IS NOT NULL AND p_item_count >= v_threshold THEN
    RETURN 0;
  END IF;

  IF COALESCE(p_has_large, FALSE) THEN
    v_key := 'shipping_fee_home_large';
  ELSIF p_logistics_type = 'CVS' THEN
    v_key := CASE p_logistics_subtype
      WHEN 'UNIMART' THEN 'shipping_fee_cvs_711'
      WHEN 'FAMI'    THEN 'shipping_fee_cvs_family'
      WHEN 'HILIFE'  THEN 'shipping_fee_cvs_hilife'
      WHEN 'OKMART'  THEN 'shipping_fee_cvs_ok'
      ELSE 'shipping_fee_cvs'
    END;
  ELSE
    v_key := 'shipping_fee_home';
  END IF;

  SELECT value INTO v_fee FROM public.platform_settings WHERE key = v_key;
  IF v_fee IS NULL THEN
    SELECT value INTO v_fee FROM public.platform_settings WHERE key = 'shipping_fee_home';
  END IF;

  -- 設定全缺時退 60，不要回 0 —— 那等於免費送
  RETURN COALESCE(v_fee::INTEGER, 60);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_exchange_order_with_code(p_offer_id uuid, p_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
  v_offer_owner uuid;
  v_offer_status text;
  v_existing_id uuid;
  v_existing_initiator uuid;
  v_code text;
  v_new_id uuid;
  v_clean_code text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING errcode = '28000';
  END IF;

  v_clean_code := regexp_replace(COALESCE(p_code, ''), '\D', '', 'g');
  IF length(v_clean_code) <> 4 THEN
    RAISE EXCEPTION 'invalid_code' USING errcode = '22023';
  END IF;

  SELECT owner_id, status INTO v_offer_owner, v_offer_status
  FROM exchange_offers
  WHERE id = p_offer_id;

  IF v_offer_owner IS NULL THEN
    RAISE EXCEPTION 'offer_not_found' USING errcode = 'P0002';
  END IF;

  IF v_offer_status <> 'active' THEN
    RAISE EXCEPTION 'offer_not_active' USING errcode = '22000';
  END IF;

  IF v_offer_owner = auth.uid() THEN
    RAISE EXCEPTION 'cannot_initiate_own_offer' USING errcode = '42501';
  END IF;

  SELECT id, initiator_id INTO v_existing_id, v_existing_initiator
  FROM exchange_orders
  WHERE offer_id = p_offer_id AND done = FALSE AND cancelled = FALSE
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    IF v_existing_initiator = auth.uid() THEN
      RETURN v_existing_id;
    END IF;
    RAISE EXCEPTION 'offer_already_started' USING errcode = '23505';
  END IF;

  SELECT code INTO v_code FROM exchange_offer_activation_codes WHERE offer_id = p_offer_id;
  IF v_code IS NULL THEN
    RAISE EXCEPTION 'activation_code_missing' USING errcode = 'P0002';
  END IF;
  IF v_code <> v_clean_code THEN
    RAISE EXCEPTION 'invalid_code' USING errcode = '22023';
  END IF;

  BEGIN
    INSERT INTO exchange_orders (
      offer_id,
      owner_id,
      initiator_id,
      step,
      confirmations,
      recipient,
      tracking_numbers,
      receipt_media,
      ratings,
      done,
      cancelled,
      updated_at
    )
    VALUES (
      p_offer_id,
      v_offer_owner,
      auth.uid(),
      2,
      jsonb_build_object(
        '2', jsonb_build_object('owner', false, 'initiator', false),
        '3', jsonb_build_object('owner', false, 'initiator', false),
        '4', jsonb_build_object('owner', false, 'initiator', false)
      ),
      '{}'::jsonb,
      '{}'::jsonb,
      '{}'::jsonb,
      '{}'::jsonb,
      FALSE,
      FALSE,
      NOW()
    )
    RETURNING id INTO v_new_id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT id, initiator_id INTO v_existing_id, v_existing_initiator
      FROM exchange_orders
      WHERE offer_id = p_offer_id AND done = FALSE AND cancelled = FALSE
      LIMIT 1;
      IF v_existing_id IS NOT NULL AND v_existing_initiator = auth.uid() THEN
        RETURN v_existing_id;
      END IF;
      RAISE;
  END;

  INSERT INTO exchange_messages (offer_id, order_id, sender_id, receiver_id, kind, body)
  VALUES (p_offer_id, v_new_id, auth.uid(), v_offer_owner, 'system', '交換已啟動');

  RETURN v_new_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delivery_has_large_item(p_user_id uuid, p_draw_record_ids bigint[])
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM draw_records dr
    JOIN products p       ON p.id  = dr.product_id
    LEFT JOIN product_prizes pp ON pp.id = dr.product_prize_id
    WHERE dr.id = ANY(p_draw_record_ids)
      AND dr.user_id = p_user_id
      AND dr.status = 'in_warehouse'
      AND p.type IN ('ichiban', 'custom')
      AND COALESCE(pp.total, 999) <= 3
  );
$function$
;

CREATE OR REPLACE FUNCTION public.get_exchange_offer_activation_code(p_offer_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
  v_owner uuid;
  v_code text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING errcode = '28000';
  END IF;

  SELECT owner_id INTO v_owner FROM exchange_offers WHERE id = p_offer_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'offer_not_found' USING errcode = 'P0002';
  END IF;
  IF v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  SELECT code INTO v_code FROM exchange_offer_activation_codes WHERE offer_id = p_offer_id;
  IF v_code IS NULL THEN
    RAISE EXCEPTION 'activation_code_missing' USING errcode = 'P0002';
  END IF;

  RETURN v_code;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_displays(p_ids uuid[])
 RETURNS TABLE(id uuid, name text, avatar_url text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
  SELECT
    pid.id,
    COALESCE(NULLIF(u.name, ''), NULLIF(split_part(au.email, '@', 1), ''), 'user') as name,
    COALESCE(NULLIF(au.raw_user_meta_data->>'avatar_url', ''), '/images/avatar.png') as avatar_url
  FROM unnest(p_ids) as pid(id)
  LEFT JOIN public.users u ON u.id = pid.id
  LEFT JOIN auth.users au ON au.id = pid.id;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_draw_mission_progress()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_task RECORD;
  v_period_key TEXT;
  v_price INT;
  v_is_major BOOLEAN;
  v_meta JSONB;
  v_product_id TEXT;
BEGIN
  -- Loop through all relevant tasks
  FOR v_task IN SELECT * FROM tasks WHERE is_active = true AND 
    condition_type IN ('draw_count', 'spend_amount', 'win_sr', 'play_unique_machine') LOOP
    
    -- Set Period Key
    IF v_task.type = 'daily' THEN
      v_period_key := to_char(NEW.created_at, 'YYYY-MM-DD');
    ELSIF v_task.type = 'weekly' THEN
      v_period_key := to_char(NEW.created_at, 'IYYY-IW');
    ELSE
      v_period_key := 'ALL';
    END IF;

    -- Logic per condition
    IF v_task.condition_type = 'draw_count' THEN
        INSERT INTO user_task_progress (user_id, task_id, progress, period_key)
        VALUES (NEW.user_id, v_task.id, 1, v_period_key)
        ON CONFLICT (user_id, task_id, period_key)
        DO UPDATE SET progress = user_task_progress.progress + 1, last_updated = NOW();

    ELSIF v_task.condition_type = 'spend_amount' THEN
        -- Get price from products table
        SELECT price INTO v_price FROM products WHERE id = NEW.product_id;
        IF v_price IS NULL THEN v_price := 0; END IF;
        
        INSERT INTO user_task_progress (user_id, task_id, progress, period_key)
        VALUES (NEW.user_id, v_task.id, v_price, v_period_key)
        ON CONFLICT (user_id, task_id, period_key)
        DO UPDATE SET progress = user_task_progress.progress + v_price, last_updated = NOW();

    ELSIF v_task.condition_type = 'win_sr' THEN
        -- Check if prize is Major Prize (SR equivalent)
        SELECT NEW.prize_level = ANY(major_prizes) INTO v_is_major FROM products WHERE id = NEW.product_id;
        
        -- Fallback: Check if prize level starts with S, A, B or is Last One
        IF v_is_major IS NULL OR v_is_major = false THEN
           IF NEW.prize_level IN ('A', 'B', 'S', 'SS', 'SSR', 'SR', 'UR', 'Last One', 'LAST ONE', 'SP') OR NEW.prize_level LIKE '%賞' THEN
             v_is_major := true;
           END IF;
        END IF;

        IF v_is_major THEN
            INSERT INTO user_task_progress (user_id, task_id, progress, period_key)
            VALUES (NEW.user_id, v_task.id, 1, v_period_key)
            ON CONFLICT (user_id, task_id, period_key)
            DO UPDATE SET progress = user_task_progress.progress + 1, last_updated = NOW();
        END IF;

    ELSIF v_task.condition_type = 'play_unique_machine' THEN
        v_product_id := NEW.product_id::text;
        
        -- Get current meta
        SELECT metadata INTO v_meta FROM user_task_progress 
        WHERE user_id = NEW.user_id AND task_id = v_task.id AND period_key = v_period_key;
        
        IF v_meta IS NULL THEN v_meta := '{"played_ids": []}'::jsonb; END IF;
        
        IF NOT (v_meta->'played_ids' ? v_product_id) THEN
             IF NOT (v_meta ? 'played_ids') THEN
                v_meta := jsonb_set(v_meta, '{played_ids}', '[]'::jsonb);
             END IF;

             v_meta := jsonb_set(v_meta, '{played_ids}', (v_meta->'played_ids') || to_jsonb(v_product_id));
             
             INSERT INTO user_task_progress (user_id, task_id, progress, period_key, metadata)
             VALUES (NEW.user_id, v_task.id, 1, v_period_key, v_meta)
             ON CONFLICT (user_id, task_id, period_key)
             DO UPDATE SET progress = user_task_progress.progress + 1, metadata = v_meta, last_updated = NOW();
        END IF;
    END IF;

    -- Check completion
    UPDATE user_task_progress 
    SET is_completed = true 
    WHERE user_id = NEW.user_id 
      AND task_id = v_task.id 
      AND period_key = v_period_key 
      AND progress >= v_task.target_value 
      AND is_completed = false;
      
  END LOOP;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_recharge_mission_progress()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_task RECORD;
  v_period_key TEXT;
BEGIN
  IF NEW.status = 'success' AND (OLD.status IS NULL OR OLD.status != 'success') THEN
      -- Daily Recharge
      v_period_key := to_char(NEW.created_at, 'YYYY-MM-DD');
      
      FOR v_task IN SELECT * FROM tasks WHERE condition_type = 'recharge' AND type = 'daily' AND is_active = true LOOP
        INSERT INTO user_task_progress (user_id, task_id, progress, period_key)
        VALUES (NEW.user_id, v_task.id, 1, v_period_key)
        ON CONFLICT (user_id, task_id, period_key)
        DO UPDATE SET progress = user_task_progress.progress + 1, last_updated = NOW();
        
        UPDATE user_task_progress SET is_completed = true 
        WHERE user_id = NEW.user_id AND task_id = v_task.id AND period_key = v_period_key AND progress >= v_task.target_value AND is_completed = false;
      END LOOP;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_exchange_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
  v_title text;
  v_body text;
  v_link text;
BEGIN
  IF NEW.receiver_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_title := '交換私訊';
  v_body := CASE
    WHEN NEW.kind = 'offer' THEN '交換小卡'
    WHEN NEW.kind = 'system' THEN COALESCE(NULLIF(NEW.body, ''), '系統訊息')
    ELSE COALESCE(NULLIF(NEW.body, ''), '收到新訊息')
  END;
  v_link := '/messages/' || NEW.offer_id::text || '--' || NEW.sender_id::text;

  INSERT INTO notifications (user_id, type, title, body, link, meta)
  VALUES (
    NEW.receiver_id,
    'exchange_message',
    v_title,
    left(v_body, 120),
    v_link,
    jsonb_build_object('offer_id', NEW.offer_id, 'order_id', NEW.order_id, 'sender_id', NEW.sender_id)
  );

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_exchange_order_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
BEGIN
  INSERT INTO notifications (user_id, type, title, body, link, meta)
  VALUES
  (
    NEW.owner_id,
    'exchange_order_started',
    '有人啟動交換',
    '點我查看交換進度',
    '/exchange-orders/' || NEW.id::text,
    jsonb_build_object('offer_id', NEW.offer_id, 'order_id', NEW.id, 'initiator_id', NEW.initiator_id)
  ),
  (
    NEW.initiator_id,
    'exchange_order_started',
    '交換已啟動',
    '點我查看交換進度',
    '/exchange-orders/' || NEW.id::text,
    jsonb_build_object('offer_id', NEW.offer_id, 'order_id', NEW.id, 'owner_id', NEW.owner_id)
  );

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_exchange_order_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
  v_step_title text;
  v_owner_track_new text;
  v_owner_track_old text;
  v_init_track_new text;
  v_init_track_old text;
  v_owner_rating_new boolean;
  v_owner_rating_old boolean;
  v_init_rating_new boolean;
  v_init_rating_old boolean;
  v_owner_receipt_new_len int;
  v_owner_receipt_old_len int;
  v_init_receipt_new_len int;
  v_init_receipt_old_len int;
BEGIN
  IF NEW.cancelled IS TRUE AND COALESCE(OLD.cancelled, FALSE) IS FALSE THEN
    INSERT INTO notifications (user_id, type, title, body, link, meta)
    VALUES
    (
      NEW.owner_id,
      'exchange_order_cancelled',
      '交換已取消',
      '此交換已被取消',
      '/exchange-orders/' || NEW.id::text,
      jsonb_build_object('offer_id', NEW.offer_id, 'order_id', NEW.id)
    ),
    (
      NEW.initiator_id,
      'exchange_order_cancelled',
      '交換已取消',
      '此交換已被取消',
      '/exchange-orders/' || NEW.id::text,
      jsonb_build_object('offer_id', NEW.offer_id, 'order_id', NEW.id)
    );
  END IF;

  IF NEW.step IS DISTINCT FROM OLD.step THEN
    v_step_title :=
      CASE NEW.step
        WHEN 2 THEN '交換已進入確認'
        WHEN 3 THEN '交換已進入寄出'
        WHEN 4 THEN '交換已進入收件'
        WHEN 5 THEN '交換已完成'
        ELSE '交換狀態更新'
      END;

    INSERT INTO notifications (user_id, type, title, body, link, meta)
    VALUES
    (
      NEW.owner_id,
      'exchange_order_step',
      v_step_title,
      '點我查看交換進度',
      '/exchange-orders/' || NEW.id::text,
      jsonb_build_object('offer_id', NEW.offer_id, 'order_id', NEW.id, 'step', NEW.step)
    ),
    (
      NEW.initiator_id,
      'exchange_order_step',
      v_step_title,
      '點我查看交換進度',
      '/exchange-orders/' || NEW.id::text,
      jsonb_build_object('offer_id', NEW.offer_id, 'order_id', NEW.id, 'step', NEW.step)
    );
  END IF;

  v_owner_track_new := COALESCE(NULLIF(NEW.tracking_numbers->>'owner', ''), '');
  v_owner_track_old := COALESCE(NULLIF(OLD.tracking_numbers->>'owner', ''), '');
  IF v_owner_track_new <> '' AND v_owner_track_old = '' THEN
    INSERT INTO notifications (user_id, type, title, body, link, meta)
    VALUES (
      NEW.initiator_id,
      'exchange_tracking',
      '對方已填寫物流編號',
      '點我查看物流資訊',
      '/exchange-orders/' || NEW.id::text,
      jsonb_build_object('offer_id', NEW.offer_id, 'order_id', NEW.id)
    );
  END IF;

  v_init_track_new := COALESCE(NULLIF(NEW.tracking_numbers->>'initiator', ''), '');
  v_init_track_old := COALESCE(NULLIF(OLD.tracking_numbers->>'initiator', ''), '');
  IF v_init_track_new <> '' AND v_init_track_old = '' THEN
    INSERT INTO notifications (user_id, type, title, body, link, meta)
    VALUES (
      NEW.owner_id,
      'exchange_tracking',
      '對方已填寫物流編號',
      '點我查看物流資訊',
      '/exchange-orders/' || NEW.id::text,
      jsonb_build_object('offer_id', NEW.offer_id, 'order_id', NEW.id)
    );
  END IF;

  v_owner_rating_new := COALESCE((NEW.ratings->'owner'->>'submitted')::boolean, false);
  v_owner_rating_old := COALESCE((OLD.ratings->'owner'->>'submitted')::boolean, false);
  IF v_owner_rating_new IS TRUE AND v_owner_rating_old IS FALSE THEN
    INSERT INTO notifications (user_id, type, title, body, link, meta)
    VALUES (
      NEW.initiator_id,
      'exchange_rating',
      '對方已送出評價',
      '點我查看交換結果',
      '/exchange-orders/' || NEW.id::text,
      jsonb_build_object('offer_id', NEW.offer_id, 'order_id', NEW.id)
    );
  END IF;

  v_init_rating_new := COALESCE((NEW.ratings->'initiator'->>'submitted')::boolean, false);
  v_init_rating_old := COALESCE((OLD.ratings->'initiator'->>'submitted')::boolean, false);
  IF v_init_rating_new IS TRUE AND v_init_rating_old IS FALSE THEN
    INSERT INTO notifications (user_id, type, title, body, link, meta)
    VALUES (
      NEW.owner_id,
      'exchange_rating',
      '對方已送出評價',
      '點我查看交換結果',
      '/exchange-orders/' || NEW.id::text,
      jsonb_build_object('offer_id', NEW.offer_id, 'order_id', NEW.id)
    );
  END IF;

  v_owner_receipt_new_len := COALESCE(jsonb_array_length(NEW.receipt_media->'owner'->'media'), 0);
  v_owner_receipt_old_len := COALESCE(jsonb_array_length(OLD.receipt_media->'owner'->'media'), 0);
  IF v_owner_receipt_new_len > 0 AND v_owner_receipt_new_len > v_owner_receipt_old_len THEN
    INSERT INTO notifications (user_id, type, title, body, link, meta)
    VALUES (
      NEW.initiator_id,
      'exchange_receipt',
      '對方已上傳收件證明',
      '點我查看收件證明',
      '/exchange-orders/' || NEW.id::text,
      jsonb_build_object('offer_id', NEW.offer_id, 'order_id', NEW.id)
    );
  END IF;

  v_init_receipt_new_len := COALESCE(jsonb_array_length(NEW.receipt_media->'initiator'->'media'), 0);
  v_init_receipt_old_len := COALESCE(jsonb_array_length(OLD.receipt_media->'initiator'->'media'), 0);
  IF v_init_receipt_new_len > 0 AND v_init_receipt_new_len > v_init_receipt_old_len THEN
    INSERT INTO notifications (user_id, type, title, body, link, meta)
    VALUES (
      NEW.owner_id,
      'exchange_receipt',
      '對方已上傳收件證明',
      '點我查看收件證明',
      '/exchange-orders/' || NEW.id::text,
      jsonb_build_object('offer_id', NEW.offer_id, 'order_id', NEW.id)
    );
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.process_coupon_expiry_notifications()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_count INTEGER := 0;
  r RECORD;
BEGIN
  FOR r IN
    SELECT uc.id,
           uc.user_id,
           uc.expiry_date,
           c.title
    FROM user_coupons uc
    JOIN coupons c ON c.id = uc.coupon_id
    WHERE uc.status = 'unused'
      AND uc.expiry_date IS NOT NULL
      AND uc.expiry_date > v_now
      AND uc.expiry_date <= v_now + INTERVAL '3 days'
      AND COALESCE(uc.expiry_reminder_sent, FALSE) = FALSE
  LOOP
    INSERT INTO notifications (
      user_id,
      type,
      title,
      body,
      link,
      meta
    )
    VALUES (
      r.user_id,
      'coupon',
      '優惠券即將到期提醒',
      format('您的一張優惠券「%s」即將於 %s 到期，請儘快使用。', r.title, to_char(r.expiry_date, 'YYYY-MM-DD')),
      '/profile?tab=coupons',
      jsonb_build_object(
        'user_coupon_id', r.id,
        'title', r.title,
        'expiry_date', r.expiry_date
      )
    );

    UPDATE user_coupons
    SET expiry_reminder_sent = TRUE
    WHERE id = r.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.process_topup(p_amount numeric, p_bonus numeric)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user_id UUID;
  v_order_number VARCHAR(50);
  v_total_tokens INTEGER;
  v_new_balance INTEGER;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Generate order number: TP + YYMMDD (6 digits) + Random 4 digits (Total 12 digits)
  v_order_number := 'TP' || to_char(now(), 'YYMMDD') || lpad(floor(random() * 10000)::text, 4, '0');
  
  v_total_tokens := p_amount + p_bonus;

  INSERT INTO recharge_records (
    order_number,
    user_id,
    amount,
    bonus,
    status
  ) VALUES (
    v_order_number,
    v_user_id,
    p_amount,
    p_bonus,
    'success'
  );

  UPDATE users
  SET tokens = tokens + v_total_tokens
  WHERE id = v_user_id
  RETURNING tokens INTO v_new_balance;

  INSERT INTO notifications (
    user_id,
    type,
    title,
    body,
    link,
    meta
  )
  VALUES (
    v_user_id,
    'topup',
    '儲值成功通知',
    format('您成功儲值 %s 元，獲得 %s 代幣（含贈送 %s）', p_amount, v_total_tokens, p_bonus),
    '/profile?tab=topup-history',
    jsonb_build_object(
      'order_number', v_order_number,
      'amount', p_amount,
      'bonus', p_bonus,
      'added_tokens', v_total_tokens,
      'new_balance', v_new_balance
    )
  );

  RETURN json_build_object(
    'success', true,
    'order_number', v_order_number,
    'added_tokens', v_total_tokens,
    'new_balance', v_new_balance
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.purchase_marketplace_listing_item(p_listing_id bigint, p_item_index integer, p_quantity integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
  v_buyer_id UUID;
  v_listing RECORD;
  v_items JSONB;
  v_item JSONB;
  v_items_len INTEGER;
  v_available INTEGER;
  v_new_qty INTEGER;
  v_unit_price INTEGER;
  v_total_price INTEGER;
  v_buyer_tokens INTEGER;
  v_fee INTEGER;
  v_seller_receive INTEGER;
  v_item_name TEXT;
  v_all_sold BOOLEAN;
BEGIN
  v_buyer_id := auth.uid();
  IF v_buyer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'login_required');
  END IF;

  IF p_quantity IS NULL OR p_quantity < 1 THEN
    RETURN jsonb_build_object('success', false, 'message', 'invalid_quantity');
  END IF;

  SELECT * INTO v_listing
  FROM public.marketplace_listings
  WHERE id = p_listing_id AND status = 'active'
  FOR UPDATE;

  IF v_listing IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'listing_not_found');
  END IF;

  v_items := COALESCE(v_listing.items, '[]'::jsonb);
  IF jsonb_typeof(v_items) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'message', 'invalid_items');
  END IF;

  v_items_len := jsonb_array_length(v_items);
  IF p_item_index IS NULL OR p_item_index < 0 OR p_item_index >= v_items_len THEN
    RETURN jsonb_build_object('success', false, 'message', 'invalid_item');
  END IF;

  v_item := v_items -> p_item_index;
  v_available := COALESCE(NULLIF((v_item ->> 'quantity'), '')::int, 1);
  IF v_available < p_quantity THEN
    RETURN jsonb_build_object('success', false, 'message', 'insufficient_stock');
  END IF;

  v_unit_price := COALESCE(v_listing.price, 0);
  IF v_unit_price <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'invalid_price');
  END IF;

  v_total_price := v_unit_price * p_quantity;
  SELECT tokens INTO v_buyer_tokens FROM public.users WHERE id = v_buyer_id;
  IF v_buyer_tokens IS NULL OR v_buyer_tokens < v_total_price THEN
    RETURN jsonb_build_object('success', false, 'message', 'insufficient_tokens');
  END IF;

  v_fee := FLOOR(v_total_price * 0.05);
  v_seller_receive := v_total_price - v_fee;

  UPDATE public.users SET tokens = tokens - v_total_price WHERE id = v_buyer_id;
  UPDATE public.users SET tokens = tokens + v_seller_receive WHERE id = v_listing.seller_id;

  v_new_qty := v_available - p_quantity;
  v_items := jsonb_set(
    v_items,
    ARRAY[p_item_index::text, 'quantity'],
    to_jsonb(v_new_qty),
    true
  );

  v_item_name := COALESCE(NULLIF((v_item ->> 'name'), ''), '未知卡片');

  UPDATE public.marketplace_listings
  SET items = v_items, updated_at = NOW()
  WHERE id = p_listing_id;

  SELECT NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_items) AS e
    WHERE COALESCE(NULLIF((e->>'quantity'), '')::int, 1) > 0
  ) INTO v_all_sold;

  IF v_all_sold THEN
    UPDATE public.marketplace_listings
    SET status = 'sold', updated_at = NOW()
    WHERE id = p_listing_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'marketplace_transactions') THEN
    INSERT INTO public.marketplace_transactions (
      listing_id, buyer_id, seller_id, draw_record_id, price, fee, seller_receive, item_index, item_name, quantity, unit_price
    ) VALUES (
      p_listing_id, v_buyer_id, v_listing.seller_id, v_listing.draw_record_id, v_total_price, v_fee, v_seller_receive,
      p_item_index, v_item_name, p_quantity, v_unit_price
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Purchase successful');
END;
$function$
;

-- exchange 通知 triggers
DROP TRIGGER IF EXISTS trg_notify_exchange_message ON public.exchange_messages;
CREATE TRIGGER trg_notify_exchange_message AFTER INSERT ON public.exchange_messages FOR EACH ROW EXECUTE FUNCTION notify_exchange_message();
DROP TRIGGER IF EXISTS trg_notify_exchange_order_insert ON public.exchange_orders;
CREATE TRIGGER trg_notify_exchange_order_insert AFTER INSERT ON public.exchange_orders FOR EACH ROW EXECUTE FUNCTION notify_exchange_order_insert();
DROP TRIGGER IF EXISTS trg_notify_exchange_order_update ON public.exchange_orders;
CREATE TRIGGER trg_notify_exchange_order_update AFTER UPDATE ON public.exchange_orders FOR EACH ROW EXECUTE FUNCTION notify_exchange_order_update();
