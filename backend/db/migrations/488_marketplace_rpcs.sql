-- 488：交易所的上架、取消與購買
--
-- 交易所的定位（老闆定義）：倉庫裡**還沒配送**、而且是**大賞**的品項可以上架，
-- 賣掉換成 G 幣。跟「販售」不同 —— 那個像露天拍賣，收的是真錢、賣什麼都行。
--
-- 現況是這一塊根本沒有後端：
--   1. 倉庫的「上架市集」按鈕呼叫 create_listing，這個函數在兩個環境都不存在，
--      按下去必定跳「上架失敗」。cancel_listing 同樣不存在
--   2. 全站沒有任何寫入 marketplace_orders / marketplace_transactions 的程式碼，
--      也就是說沒有買方流程
--   3. 大賞的判定 isMajorGrade 只寫在 profile 頁的 JS 裡，
--      直接打 API 就能上架小獎
--
-- 這一支補齊三個 RPC 與 DB 端的驗證。前端只負責藏按鈕，能不能上架由這裡說了算。

-- ─────────────────────────────────────────────────────────────
-- 手續費
-- ─────────────────────────────────────────────────────────────
INSERT INTO public.platform_settings (key, value)
VALUES ('marketplace_fee_percent', '5')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.marketplace_fee_percent()
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT GREATEST(0, LEAST(50, COALESCE(
    (SELECT NULLIF(value, '')::int FROM public.platform_settings WHERE key = 'marketplace_fee_percent'),
    5)))
$$;

-- ─────────────────────────────────────────────────────────────
-- 大賞判定
--
-- 這是前端 isMajorGrade（frontend/app/profile/page.tsx）的 DB 版本，
-- 規則必須一致：前端只負責決定要不要顯示「上架市集」按鈕，
-- 能不能上架由這裡說了算。改其中一邊時另一邊要跟著改。
--
-- 抽卡的 SSR/SR/R/N 不在名單裡，所以卡片目前上不了架 —— 這是沿用前端
-- 既有的定義，不是這支 migration 新加的限制。
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_major_grade(p_grade text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_levels text[] := ARRAY['SP賞','S賞','A賞','B賞','C賞','SP','S','A','B','C','LAST ONE','最後賞'];
  v_trim   text;
  v_upper  text;
  v_base   text;
  v_idx    int;
BEGIN
  IF p_grade IS NULL THEN RETURN false; END IF;
  v_trim := btrim(p_grade);
  IF v_trim = '' THEN RETURN false; END IF;

  v_upper := upper(v_trim);
  IF v_upper = 'LAST ONE' OR v_trim = '最後賞' THEN RETURN true; END IF;
  IF v_trim = ANY(v_levels) OR v_upper = ANY(v_levels) THEN RETURN true; END IF;

  -- 「A賞 限定版」這種寫法：取「賞」以前、空白以前的那一段再比對
  v_base := v_trim;
  v_idx := position('賞' in v_base);
  IF v_idx > 0 THEN v_base := left(v_base, v_idx - 1); END IF;
  IF position(' ' in v_base) > 0 THEN v_base := split_part(v_base, ' ', 1); END IF;

  RETURN upper(v_base) = ANY(v_levels);
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 上架
--
-- p_user_id 保留是為了不動既有的前端呼叫，但一律以 auth.uid() 為準 ——
-- 這是 SECURITY DEFINER，信任傳進來的 user_id 等於任何人都能上架別人的獎品。
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_listing(
  p_record_id bigint,
  p_price     integer,
  p_user_id   uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := COALESCE(auth.uid(), p_user_id);
  v_rec    RECORD;
  v_listing_id bigint;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '請先登入');
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS NOT NULL AND p_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'message', '無法操作他人的獎品');
  END IF;
  IF p_price IS NULL OR p_price <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', '售價要大於 0');
  END IF;

  SELECT dr.id, dr.user_id, dr.status, dr.prize_level, dr.created_at,
         p.sale_mode, p.is_preorder, p.preorder_available_at
    INTO v_rec
    FROM draw_records dr
    JOIN products p ON p.id = dr.product_id
   WHERE dr.id = p_record_id
   FOR UPDATE OF dr;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', '找不到這個獎品');
  END IF;
  IF v_rec.user_id <> v_uid THEN
    RETURN jsonb_build_object('success', false, 'message', '這不是你的獎品');
  END IF;
  IF v_rec.status = 'listing' THEN
    RETURN jsonb_build_object('success', false, 'message', '這個獎品已經在架上了');
  END IF;
  -- 已申請出貨、已出貨、已分解的都不能上架
  IF v_rec.status <> 'in_warehouse' THEN
    RETURN jsonb_build_object('success', false, 'message', '只有還沒申請配送的獎品可以上架');
  END IF;
  IF NOT public.is_major_grade(v_rec.prize_level) THEN
    RETURN jsonb_build_object('success', false, 'message', '只有大賞可以上架交易所');
  END IF;
  -- 抽籤販售是 0 元抽來的，上架等於沒付一毛錢就換到 G 幣
  IF v_rec.sale_mode = 'lottery' THEN
    RETURN jsonb_build_object('success', false, 'message', '抽籤販售的獎品不能上架');
  END IF;
  -- 預購還沒到貨的東西賣掉，買家等於買到一張不知道何時能出貨的憑證
  IF v_rec.is_preorder AND COALESCE(v_rec.preorder_available_at, 'infinity'::timestamptz) > NOW() THEN
    RETURN jsonb_build_object('success', false, 'message', '預購商品要等到貨之後才能上架');
  END IF;

  INSERT INTO marketplace_listings (seller_id, draw_record_id, price, status, item_type)
  VALUES (v_uid, p_record_id, p_price, 'active', 'draw_prize')
  RETURNING id INTO v_listing_id;

  -- 改成 listing 之後，出貨（create_delivery_orders_split）與分解（dismantle_prizes）
  -- 都會自動略過它 —— 那兩支都只吃 in_warehouse。不必另外加防呆
  UPDATE draw_records SET status = 'listing' WHERE id = p_record_id;

  RETURN jsonb_build_object('success', true, 'message', '上架成功', 'listing_id', v_listing_id);
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 下架
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_listing(
  p_listing_id bigint,
  p_user_id    uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := COALESCE(auth.uid(), p_user_id);
  v_lst RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '請先登入');
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id IS NOT NULL AND p_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'message', '無法操作他人的上架');
  END IF;

  SELECT * INTO v_lst FROM marketplace_listings WHERE id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', '找不到這筆上架');
  END IF;
  IF v_lst.seller_id <> v_uid THEN
    RETURN jsonb_build_object('success', false, 'message', '這不是你的上架');
  END IF;
  IF v_lst.status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'message',
      CASE WHEN v_lst.status = 'sold' THEN '已經賣掉了，沒辦法下架' ELSE '這筆上架已經取消過了' END);
  END IF;

  UPDATE marketplace_listings SET status = 'cancelled', updated_at = NOW() WHERE id = p_listing_id;

  -- 東西還在賣家手上，退回倉庫。用 listing 這個狀態當條件，
  -- 避免把中間被其他流程改過狀態的資料也一起蓋回去
  UPDATE draw_records SET status = 'in_warehouse'
   WHERE id = v_lst.draw_record_id AND status = 'listing';

  RETURN jsonb_build_object('success', true, 'message', '已下架');
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 購買
--
-- 買家付 G 幣、賣家收 G 幣（扣手續費）、獎品換手。全部在一個交易裡完成。
-- 兩筆 token_adjustments 是為了對帳：token_ledger 從那張表認列手動增減，
-- 這裡一減一加，淨值等於 -手續費，正好是離開流通的部分。
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.buy_listing(p_listing_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_buyer  uuid := auth.uid();
  v_lst    RECORD;
  v_rec    RECORD;
  v_tokens bigint;
  v_fee    integer;
  v_net    integer;
BEGIN
  IF v_buyer IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '請先登入');
  END IF;

  -- 先鎖上架，同一筆同時只有一個人買得到
  SELECT * INTO v_lst FROM marketplace_listings WHERE id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', '找不到這筆商品');
  END IF;
  IF v_lst.status <> 'active' THEN
    -- 賣掉跟賣家自己收回來是兩件事，講清楚買家才知道還有沒有機會
    RETURN jsonb_build_object('success', false, 'message',
      CASE WHEN v_lst.status = 'sold' THEN '這件已經被買走了' ELSE '賣家已經把這件下架了' END);
  END IF;
  IF v_lst.seller_id = v_buyer THEN
    RETURN jsonb_build_object('success', false, 'message', '不能買自己上架的東西');
  END IF;

  SELECT dr.* INTO v_rec FROM draw_records dr WHERE dr.id = v_lst.draw_record_id FOR UPDATE;
  IF NOT FOUND OR v_rec.status <> 'listing' OR v_rec.user_id <> v_lst.seller_id THEN
    -- 上架還在但獎品狀態對不上，代表資料被其他流程動過。與其硬賣，不如收掉這筆
    UPDATE marketplace_listings SET status = 'cancelled', updated_at = NOW() WHERE id = p_listing_id;
    RETURN jsonb_build_object('success', false, 'message', '這件商品已經無法購買');
  END IF;

  SELECT COALESCE(tokens, 0) INTO v_tokens FROM users WHERE id = v_buyer FOR UPDATE;
  IF v_tokens < v_lst.price THEN
    RETURN jsonb_build_object('success', false, 'message', 'G 幣不足');
  END IF;

  v_fee := FLOOR(v_lst.price * public.marketplace_fee_percent() / 100.0);
  v_net := v_lst.price - v_fee;

  UPDATE users SET tokens = COALESCE(tokens, 0) - v_lst.price WHERE id = v_buyer;
  UPDATE users SET tokens = COALESCE(tokens, 0) + v_net       WHERE id = v_lst.seller_id;

  INSERT INTO token_adjustments (user_id, delta, reason, created_by)
  VALUES (v_buyer,         -v_lst.price, '交易所購買', 'marketplace'),
         (v_lst.seller_id,  v_net,       '交易所售出', 'marketplace');

  -- 獎品換手。回到 in_warehouse，買家可以出貨、分解或再上架
  UPDATE draw_records
     SET user_id = v_buyer, status = 'in_warehouse'
   WHERE id = v_lst.draw_record_id;

  UPDATE marketplace_listings SET status = 'sold', updated_at = NOW() WHERE id = p_listing_id;

  INSERT INTO marketplace_transactions
    (listing_id, buyer_id, seller_id, draw_record_id, price, fee, seller_receive)
  VALUES
    (p_listing_id, v_buyer, v_lst.seller_id, v_lst.draw_record_id, v_lst.price, v_fee, v_net);

  RETURN jsonb_build_object(
    'success', true, 'message', '購買成功',
    'price', v_lst.price, 'new_balance', v_tokens - v_lst.price
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_listing(bigint, integer, uuid) FROM public;
REVOKE ALL ON FUNCTION public.cancel_listing(bigint, uuid)          FROM public;
REVOKE ALL ON FUNCTION public.buy_listing(bigint)                   FROM public;
GRANT EXECUTE ON FUNCTION public.create_listing(bigint, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_listing(bigint, uuid)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.buy_listing(bigint)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_major_grade(text)                  TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 倉庫逾期自動分解要認得「換手」
--
-- 484 是用 draw_records.created_at 起算 30 天。買來的獎品沿用原本的抽獎時間，
-- 所以一件半年前抽到的東西，買家拿到手當天就會被分解掉。
-- 改成有交易記錄時從最後一次成交起算。
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_dismantle_expired_warehouse_items()
RETURNS TABLE(dismantled_count integer, total_tokens_refunded integer)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user   RECORD;
  v_result RECORD;
  v_count  INT := 0;
  v_tokens INT := 0;
BEGIN
  FOR v_user IN
    SELECT dr.user_id, array_agg(dr.id) AS record_ids
    FROM public.draw_records dr
    JOIN public.users    u ON u.id = dr.user_id
    JOIN public.products p ON p.id = dr.product_id
    LEFT JOIN LATERAL (
      SELECT max(t.created_at) AS traded_at
      FROM public.marketplace_transactions t
      WHERE t.draw_record_id = dr.id
    ) tx ON true
    WHERE dr.status = 'in_warehouse'
      AND (u.is_bot IS NULL OR u.is_bot = false)
      -- 抽籤販售有自己的逾期處理（expire_lottery_holds），別插手
      AND p.sale_mode IS DISTINCT FROM 'lottery'
      -- 預購從「可以出貨的那天」起算；買來的從「成交那天」起算。
      -- 兩個都取最大值，最晚的那個時間點才是這個人真正持有它的起點
      AND GREATEST(
            dr.created_at,
            COALESCE(p.preorder_available_at, dr.created_at),
            COALESCE(tx.traded_at, dr.created_at)
          ) < NOW() - INTERVAL '30 days'
    GROUP BY dr.user_id
  LOOP
    SELECT * INTO v_result
    FROM public.dismantle_prizes(v_user.record_ids, v_user.user_id);

    v_count  := v_count  + COALESCE(v_result.success_count, 0);
    v_tokens := v_tokens + COALESCE(v_result.total_refund, 0);
  END LOOP;

  RETURN QUERY SELECT v_count, v_tokens;
END;
$$;
