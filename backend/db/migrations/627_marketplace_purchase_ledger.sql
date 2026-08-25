-- 627: 交易所購買補寫代幣帳本（老闆 2026-08-25）
--
-- purchase_marketplace_listing_item 只改 users.tokens，沒有寫 token_adjustments，
-- 所以交易所的買賣完全不會出現在 token_ledger：
--   ・玩家在「代幣明細」看不到自己在交易所花了什麼、收了什麼
--   ・財務對帳公式（recharge + manual − draw − refund）漏掉這一整塊
--   ・帳本淨額會與 users.tokens 對不起來（就像剛修掉的積分折抵那個問題）
--
-- 同性質的商城 buy_listing 早就有寫，兩支不一致。這支補齊。
--
-- 目前全站 marketplace_transactions 是 0 筆，所以沒有歷史資料要回填 ——
-- 趁交易所還沒開放先補，開放後才不會一邊累積一邊漏。

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

  /*
   * 代幣帳本（migration 627）
   *
   * 改版前這裡只改 users.tokens，沒有寫 token_adjustments —— 那表示交易所的
   * 買賣完全不會出現在 token_ledger 裡：玩家在代幣明細看不到自己花了什麼，
   * 財務對帳公式（recharge + manual − draw − refund）也漏掉這一整塊。
   *
   * 同性質的商城 buy_listing 早就有寫，兩支不一致。用相同的 reason／created_by，
   * classify_token_adjustment() 會把 created_by='marketplace' 歸到 marketplace 分類。
   *
   * 手續費（v_fee）不另外記一筆：那是平台留下的差額，不是任何一方的代幣異動，
   * 買方支出與賣方收入兩筆相減就是它，多記一筆反而會讓帳本自己對不起來。
   */
  INSERT INTO public.token_adjustments (user_id, delta, reason, created_by, category)
  VALUES (v_buyer_id,           -v_total_price,    '交易所購買', 'marketplace', 'marketplace'),
         (v_listing.seller_id,   v_seller_receive, '交易所售出', 'marketplace', 'marketplace');

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
$function$;

-- ── 給 increment_user_tokens 留一句警語 ────────────────────────
-- 它是唯一還在「只改 tokens、不寫帳本」的函數，但目前兩個呼叫端
-- （後台待複核儲值補發、AI 客服自動補發）都會先把 recharge_records 改成 success，
-- token_ledger 從那裡讀得到，所以不是缺口。
-- 危險的是它很通用：之後有人在別的地方呼叫、又沒有對應的 recharge/adjustment 紀錄，
-- 帳本就會靜默對不上，而且不會有任何錯誤訊息。
COMMENT ON FUNCTION public.increment_user_tokens(uuid, numeric) IS
  '⚠️ 只改 users.tokens，不寫 token_adjustments。呼叫前必須確保另有 recharge_records 或 token_adjustments 紀錄，否則代幣帳本會對不上（token_ledger 只 UNION 那三張表）。目前僅供儲值補發使用。';
