-- 571_sell_order_multi_item.sql
--
-- 商城接線第一批（下半）：訂單流程改吃兩層規格樹＋一單多商品。
-- 上半是 570（資料模型），這支負責把它接進交易。
--
-- ── 為什麼 specs 是唯一真相 ──
-- 570 之後 sell_listings 同時有 items（舊扁平）與 specs（兩層樹）。
-- 兩邊都存庫存 = 兩個寫入者，遲早對不起來。
-- 所以：**specs 是唯一真相**，items 由 trigger 從 specs 推導出來（單向），
-- 讓還在讀 items 的舊查詢（後台列表、sell_feed）不用同步改。

BEGIN;

-- ============================================================
-- A. items 由 specs 推導（單向同步）
-- ============================================================

CREATE OR REPLACE FUNCTION public.sell_derive_items_from_specs()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.specs IS NULL THEN
    RETURN NEW;
  END IF;

  -- 攤平成舊形狀：規格名接在品項名後面，讓只讀 items 的地方仍看得懂
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'name', CASE WHEN o->>'v' IS NULL OR o->>'v' = '標準'
                        THEN i->>'n' ELSE (o->>'v') || ' · ' || (i->>'n') END,
           'price', COALESCE(NULLIF(i->>'p','')::int, 0),
           'quantity', COALESCE(NULLIF(i->>'q','')::int, 0),
           'image', COALESCE(i->>'img','')
         )), '[]'::jsonb)
  INTO NEW.items
  FROM jsonb_array_elements(COALESCE(NEW.specs->'o','[]'::jsonb)) o,
       jsonb_array_elements(COALESCE(o->'items','[]'::jsonb)) i;

  -- 卡片標價＝最低價（原型 minP()）
  NEW.price := COALESCE(NULLIF(public.sell_spec_min_price(NEW.specs), 0), NEW.price);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sell_derive_items ON public.sell_listings;
CREATE TRIGGER trg_sell_derive_items
  BEFORE INSERT OR UPDATE OF specs ON public.sell_listings
  FOR EACH ROW EXECUTE FUNCTION public.sell_derive_items_from_specs();

-- ============================================================
-- B. 規格樹的庫存增減
-- ============================================================
-- 加減都走同一支，正數是回補、負數是扣減。回補不設上限（回到原本的數量）。

CREATE OR REPLACE FUNCTION public.sell_specs_add_qty(p_specs jsonb, p_g int, p_i int, p_delta int)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_cur int;
BEGIN
  v_cur := COALESCE(NULLIF(p_specs #>> ARRAY['o', p_g::text, 'items', p_i::text, 'q'], '')::int, 0);
  RETURN jsonb_set(p_specs, ARRAY['o', p_g::text, 'items', p_i::text, 'q'],
                   to_jsonb(GREATEST(0, v_cur + p_delta)), true);
END;
$$;

-- ============================================================
-- C. 建單（一單多商品）
-- ============================================================
--
-- p_items 形狀：[{"listing_id":1,"g":0,"i":0,"qty":1}, …]
--
-- ⚠️ 限定同一個賣家：平台不碰錢，買家是直接匯款給賣家 ——
-- 跨賣家合併結帳會變成一次匯款要拆給多人，對不了帳。
-- 原型的購物車也是照賣場分組結帳。
--
-- 運費取這批商品裡最高的一筆（同賣家一次寄出，不該逐件收運費）。

CREATE OR REPLACE FUNCTION public.sell_create_order(
  p_items jsonb,
  p_pay_method text DEFAULT NULL,
  p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_buyer    uuid;
  v_seller   uuid;
  v_profile  RECORD;
  v_method   text;
  e          jsonb;
  v_listing  RECORD;
  v_specs    jsonb;
  v_g        int;
  v_i        int;
  v_qty      int;
  v_avail    int;
  v_price    int;
  v_goods    int := 0;
  v_ship     int := 0;
  v_order_id bigint;
  v_deposit  int;
  v_label    text;
BEGIN
  v_buyer := auth.uid();
  IF v_buyer IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '請先登入');
  END IF;

  IF jsonb_typeof(COALESCE(p_items,'null'::jsonb)) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('success', false, 'message', '購物清單是空的');
  END IF;

  -- ── 第一輪：驗證、鎖定、算金額 ──
  FOR e IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := GREATEST(1, COALESCE(NULLIF(e->>'qty','')::int, 1));
    v_g   := COALESCE(NULLIF(e->>'g','')::int, 0);
    v_i   := COALESCE(NULLIF(e->>'i','')::int, 0);

    SELECT * INTO v_listing FROM public.sell_listings
    WHERE id = COALESCE(NULLIF(e->>'listing_id','')::bigint, 0) AND status = 'active'
    FOR UPDATE;

    IF v_listing IS NULL THEN
      RETURN jsonb_build_object('success', false, 'message', '有商品已經不在架上了');
    END IF;
    IF v_listing.is_official THEN
      RETURN jsonb_build_object('success', false, 'message', '官方商品請到官方商城結帳');
    END IF;
    IF v_listing.seller_id = v_buyer THEN
      RETURN jsonb_build_object('success', false, 'message', '不能購買自己的商品');
    END IF;

    -- 同一張單只能有同一個賣家（見檔頭說明）
    IF v_seller IS NULL THEN
      v_seller := v_listing.seller_id;
    ELSIF v_seller <> v_listing.seller_id THEN
      RETURN jsonb_build_object('success', false, 'message', '不同賣場要分開結帳');
    END IF;

    v_specs := v_listing.specs;
    IF v_specs IS NULL THEN
      RETURN jsonb_build_object('success', false, 'message', '商品規格設定有誤');
    END IF;

    v_avail := COALESCE(NULLIF(v_specs #>> ARRAY['o', v_g::text, 'items', v_i::text, 'q'], '')::int, -1);
    IF v_avail < 0 THEN
      RETURN jsonb_build_object('success', false, 'message', '找不到這個規格');
    END IF;
    IF v_avail < v_qty THEN
      RETURN jsonb_build_object('success', false, 'message', '庫存不足');
    END IF;

    v_price := COALESCE(NULLIF(v_specs #>> ARRAY['o', v_g::text, 'items', v_i::text, 'p'], '')::int, 0);
    IF v_price <= 0 THEN
      RETURN jsonb_build_object('success', false, 'message', '商品金額設定有誤');
    END IF;

    v_goods := v_goods + v_price * v_qty;
    v_ship  := GREATEST(v_ship, COALESCE(v_listing.shipping_fee, 0));
  END LOOP;

  -- ── 賣家收款設定 ──
  SELECT * INTO v_profile FROM public.sell_seller_profiles WHERE seller_id = v_seller;
  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '賣家尚未設定收款方式，暫時無法下單');
  END IF;
  IF v_profile.suspended_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '這位賣家目前無法交易');
  END IF;

  -- 買家選的方式要在賣家開放的清單內（570 起改複選）
  v_method := COALESCE(NULLIF(btrim(p_pay_method), ''), v_profile.payout_method);
  IF NOT (v_method = ANY (v_profile.payout_methods)) THEN
    RETURN jsonb_build_object('success', false, 'message', '賣家沒有開放這種收款方式');
  END IF;
  IF v_method = 'bank' AND (COALESCE(btrim(v_profile.transfer_bank),'') = ''
                            OR COALESCE(btrim(v_profile.transfer_account),'') = '') THEN
    RETURN jsonb_build_object('success', false, 'message', '賣家尚未填寫收款帳戶，暫時無法下單');
  END IF;
  IF v_method = 'linepay' AND COALESCE(btrim(v_profile.linepay_id),'') = '' THEN
    RETURN jsonb_build_object('success', false, 'message', '賣家尚未填寫 LINE Pay 收款資訊，暫時無法下單');
  END IF;

  -- ── 建單 ──
  INSERT INTO public.sell_orders (
    listing_id, seller_id, buyer_id, item_index, quantity,
    unit_price, shipping_fee, goods_amount, total_amount,
    payment_method, payment_status, step, cancelled
  ) VALUES (
    COALESCE(NULLIF(p_items->0->>'listing_id','')::bigint, 0), v_seller, v_buyer, 0, 1,
    0, v_ship, v_goods, v_goods + v_ship,
    v_method, 'unpaid', 1, false
  ) RETURNING id INTO v_order_id;

  -- ── 第二輪：扣庫存、寫明細 ──
  FOR e IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := GREATEST(1, COALESCE(NULLIF(e->>'qty','')::int, 1));
    v_g   := COALESCE(NULLIF(e->>'g','')::int, 0);
    v_i   := COALESCE(NULLIF(e->>'i','')::int, 0);

    SELECT * INTO v_listing FROM public.sell_listings
    WHERE id = COALESCE(NULLIF(e->>'listing_id','')::bigint, 0);

    v_specs := v_listing.specs;
    v_price := COALESCE(NULLIF(v_specs #>> ARRAY['o', v_g::text, 'items', v_i::text, 'p'], '')::int, 0);
    v_label := COALESCE(v_specs #>> ARRAY['o', v_g::text, 'v'], '')
               || CASE WHEN COALESCE(v_specs #>> ARRAY['o', v_g::text, 'v'], '') <> '' THEN ' · ' ELSE '' END
               || COALESCE(v_specs #>> ARRAY['o', v_g::text, 'items', v_i::text, 'n'], '');

    UPDATE public.sell_listings
    SET specs = public.sell_specs_add_qty(v_specs, v_g, v_i, -v_qty),
        updated_at = NOW()
    WHERE id = v_listing.id;

    INSERT INTO public.sell_order_items
      (order_id, listing_id, group_index, item_index, spec_label, title, image, unit_price, quantity)
    VALUES (v_order_id, v_listing.id, v_g, v_i, NULLIF(v_label,''), v_listing.title,
            COALESCE(v_specs #>> ARRAY['o', v_g::text, 'items', v_i::text, 'img'], (v_listing.images)[1], ''),
            v_price, v_qty);

    -- 整件賣光才下架
    IF public.sell_spec_stock((SELECT specs FROM public.sell_listings WHERE id = v_listing.id)) = 0 THEN
      UPDATE public.sell_listings SET status = 'sold', updated_at = NOW() WHERE id = v_listing.id;
    END IF;
  END LOOP;

  -- ── 保證金：改用成交小計（ROADMAP 規則 5），運費不計 ──
  v_deposit := public.sell_deposit_for(v_seller, v_goods);
  IF NOT public.sell_deposit_charge(v_order_id, v_seller, v_buyer, v_deposit) THEN
    RAISE EXCEPTION 'SELL_DEPOSIT_INSUFFICIENT';
  END IF;
  UPDATE public.sell_orders SET deposit_amount = v_deposit WHERE id = v_order_id;

  IF COALESCE(btrim(p_note),'') <> '' THEN
    INSERT INTO public.sell_messages (listing_id, sender_id, receiver_id, kind, body)
    VALUES ((SELECT listing_id FROM public.sell_orders WHERE id = v_order_id), v_buyer, v_seller, 'text', btrim(p_note));
  END IF;

  INSERT INTO public.sell_messages (listing_id, sender_id, receiver_id, kind, body)
  VALUES ((SELECT listing_id FROM public.sell_orders WHERE id = v_order_id), v_buyer, v_seller, 'system', '已建立訂單');

  RETURN jsonb_build_object('success', true, 'order_id', v_order_id,
                            'goods_amount', v_goods, 'shipping_fee', v_ship,
                            'total_amount', v_goods + v_ship, 'deposit', v_deposit,
                            'payment_method', v_method);
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM = 'SELL_DEPOSIT_INSUFFICIENT' THEN
      -- 對買家不揭露賣家餘額，那是別人的財務狀況
      RETURN jsonb_build_object('success', false, 'message', '賣家目前無法接單，請稍後再試');
    END IF;
    RAISE;
END;
$$;

-- ============================================================
-- D. 取消／逾時的庫存回補改走明細
-- ============================================================
-- 舊版只回補 items[item_index]；一單多商品後要照 sell_order_items 逐筆回補到 specs。

CREATE OR REPLACE FUNCTION public.sell_restore_stock(p_order_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT * FROM public.sell_order_items WHERE order_id = p_order_id
  LOOP
    UPDATE public.sell_listings
    SET specs = public.sell_specs_add_qty(specs, r.group_index, r.item_index, r.quantity),
        -- 賣光下架的要放回架上；pending / rejected / removed 維持原狀
        status = CASE WHEN status = 'sold' THEN 'active' ELSE status END,
        updated_at = NOW()
    WHERE id = r.listing_id AND specs IS NOT NULL;
  END LOOP;
END;
$$;

COMMIT;
