-- 577_sell_my_state_category.sql
--
-- sell_my_state 的 myList 補帶原始 category 欄位。
-- 之前只拿 category 去換圖示（sell_art_kind），沒有原值 ——
-- 「編輯商品」回填不了類別，賣家每次編輯都要重選一次。
-- 基底：575（整支重建函式，只加一個欄位）。

-- 577_sell_my_state_category.sql
--
-- sell_my_state 補回傳圖片。原型是純 SVG 插畫的，接上真商品之後
-- 「我的上架／訂單／賣家訂單」還在畫佔位圖 —— 商品有照片卻看不到，
-- 老闆一眼就會以為資料沒接上（實際上接上了，只是沒帶 images 進來）。
--
-- 明細圖優先用下單當下的品項圖快照，沒有才退回商品主圖。

BEGIN;

-- 類別 → 插畫種類。前台 data.ts 也有一份同樣的對映，
-- 兩邊都要是因為列表走 sell_feed（JS 對映）、我的走這支（SQL 對映）。
CREATE OR REPLACE FUNCTION public.sell_art_kind(p_category text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_category
    WHEN '一番賞' THEN 'fig' WHEN '公仔模型' THEN 'fig'
    WHEN '盒玩' THEN 'box'  WHEN '轉蛋' THEN 'cap'
    WHEN '卡牌' THEN 'card' WHEN '周邊商品' THEN 'plush'
    ELSE 'box' END;
$$;

CREATE OR REPLACE FUNCTION public.sell_my_state()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '請先登入');
  END IF;

  SELECT jsonb_build_object(
    'success', true,

    -- 餘額與被鎖住的保證金（原型右上角那顆 G 幣）
    'gbal',  COALESCE((SELECT tokens FROM public.users WHERE id = v_uid), 0),
    'locked', COALESCE((
      SELECT SUM(o.deposit_amount) FROM public.sell_orders o
      WHERE o.seller_id = v_uid AND o.cancelled = false AND o.step < 5
    ), 0),

    'myList', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', l.id, 't', l.title, 'p', l.price, 'ship', l.shipping_fee,
        'category', l.category,
        'img', COALESCE((l.images)[1], ''),
        'k', public.sell_art_kind(l.category),
        'q', public.sell_spec_stock(l.specs),
        'need', public.sell_deposit_for(v_uid, l.price),
        'st', CASE WHEN l.status = 'active' THEN 'active'
                   WHEN l.status = 'pending' THEN 'pending' ELSE 'off' END,
        -- 已經有人下單未結案 → 鎖住不給改（原型的鎖頭圖示）
        'locked', EXISTS (SELECT 1 FROM public.sell_orders o
                          WHERE o.listing_id = l.id AND o.cancelled = false AND o.step < 5),
        'specs', l.specs,
        'ads', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.slot_id, 'n', a.slot_id, 'left', 1))
                         FROM public.sell_ads_live a WHERE a.listing_id = l.id), '[]'::jsonb),
        'views', COALESCE(l.view_count, 0)
      ) ORDER BY l.created_at DESC)
      FROM public.sell_listings l WHERE l.seller_id = v_uid
    ), '[]'::jsonb),

    'orders', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'created' DESC) FROM (
        SELECT jsonb_build_object(
          'no', o.order_number, 'oid', o.id,
          'type', CASE WHEN l.is_official THEN 'b2c' ELSE 'c2c' END,
          'dep', o.deposit_amount,
          'items', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              't', i.title, 'spec', COALESCE(i.spec_label, ''), 'qty', i.quantity,
              'img', COALESCE(NULLIF(i.image, ''), (l2.images)[1], ''),
              'p', i.unit_price, 'k', public.sell_art_kind(l2.category), 'cid', i.listing_id))
            FROM public.sell_order_items i
            LEFT JOIN public.sell_listings l2 ON l2.id = i.listing_id
            WHERE i.order_id = o.id), '[]'::jsonb),
          'sub', o.goods_amount, 'fee', o.shipping_fee, 'off', 0,
          'p', o.total_amount,
          'k', public.sell_art_kind(l.category), 'cid', o.listing_id,
          'img', COALESCE((l.images)[1], ''),
          's', CASE WHEN l.is_official THEN '吉吉比官方旗艦店' ELSE COALESCE(u.name, '玩家') END,
          'pays', jsonb_build_array(CASE o.payment_method WHEN 'linepay' THEN 'LINE Pay' ELSE '銀行轉帳' END),
          'pay', CASE o.payment_method WHEN 'linepay' THEN 'LINE Pay' ELSE '銀行轉帳' END,
          'st', CASE WHEN o.cancelled THEN 9 ELSE GREATEST(o.step - 1, 0) END,
          -- 只有待付款才有倒數；毫秒 epoch，前端直接拿去跟 Date.now() 比
          'due', CASE WHEN o.cancelled = false AND o.step = 1
                      THEN (EXTRACT(EPOCH FROM (o.created_at + interval '15 minutes')) * 1000)::bigint
                      ELSE 0 END,
          'late', (o.overdue_notified_at IS NOT NULL),
          'track', o.tracking_number,
          'created', to_char(o.created_at, 'YYYY-MM-DD"T"HH24:MI:SS')
        ) AS x
        FROM public.sell_orders o
        JOIN public.sell_listings l ON l.id = o.listing_id
        LEFT JOIN public.users u ON u.id = o.seller_id
        WHERE o.buyer_id = v_uid
        ORDER BY o.created_at DESC LIMIT 60
      ) s
    ), '[]'::jsonb),

    'sellOrders', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'created' DESC) FROM (
        SELECT jsonb_build_object(
          'no', o.order_number, 'oid', o.id,
          't', l.title,
          'spec', COALESCE((SELECT i.spec_label FROM public.sell_order_items i
                            WHERE i.order_id = o.id ORDER BY i.id LIMIT 1), ''),
          'qty', o.quantity, 'p', o.goods_amount,
          'k', public.sell_art_kind(l.category), 'cid', o.listing_id,
          'img', COALESCE((l.images)[1], ''),
          'buyer', COALESCE(bu.name, '買家'),
          'st', CASE WHEN o.cancelled THEN 9 ELSE GREATEST(o.step - 1, 0) END,
          'dep', o.deposit_amount,
          'track', o.tracking_number,
          'late', (o.overdue_notified_at IS NOT NULL),
          'payAt', COALESCE(to_char(o.paid_at AT TIME ZONE 'Asia/Taipei', 'MM/DD HH24:MI'), '—'),
          'last5', '—',
          'way', CASE o.payment_method WHEN 'linepay' THEN 'LINE Pay' ELSE '銀行轉帳' END,
          'due', CASE WHEN o.cancelled = false AND o.step = 1
                      THEN (EXTRACT(EPOCH FROM (o.created_at + interval '15 minutes')) * 1000)::bigint
                      ELSE 0 END,
          'created', to_char(o.created_at, 'YYYY-MM-DD"T"HH24:MI:SS')
        ) AS x
        FROM public.sell_orders o
        JOIN public.sell_listings l ON l.id = o.listing_id
        LEFT JOIN public.users bu ON bu.id = o.buyer_id
        WHERE o.seller_id = v_uid
        ORDER BY o.created_at DESC LIMIT 60
      ) s
    ), '[]'::jsonb),

    'cart', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'cartId', c.id,
        'kind', CASE WHEN l.is_official THEN 'b2c' ELSE 'c2c' END,
        'id', c.listing_id, 'oi', c.group_index, 'ii', c.item_index,
        'qty', c.quantity, 'sel', true) ORDER BY c.created_at)
      FROM public.sell_cart c JOIN public.sell_listings l ON l.id = c.listing_id
      WHERE c.user_id = v_uid
    ), '[]'::jsonb),

    'myPays', COALESCE((
      SELECT jsonb_agg(CASE m WHEN 'linepay' THEN 'LINE Pay' ELSE '銀行轉帳' END)
      FROM public.sell_seller_profiles p, unnest(p.payout_methods) m
      WHERE p.seller_id = v_uid
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sell_my_state() TO authenticated;

COMMIT;
