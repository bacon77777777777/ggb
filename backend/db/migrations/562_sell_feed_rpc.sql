-- 562_sell_feed_rpc.sql
--
-- 商城列表的資料來源。
--
-- 為什麼要一支 RPC 而不是讓前台自己組：
-- 一張卡片要顯示「賣家暱稱、頭像、等級、成交率、這件的保證金、是不是廣告」，
-- 前台若自己拼，等於每頁要多打 3～4 次查詢（listings → users → tier → ads），
-- 而且保證金要照等級比例算，那個邏輯不該複製一份到 TypeScript 裡 ——
-- 之後改比例就會有兩個地方要改，遲早不同步。

BEGIN;

CREATE OR REPLACE FUNCTION public.sell_feed(
  p_official boolean DEFAULT false,
  p_category text DEFAULT NULL,
  p_search   text DEFAULT NULL,
  p_limit    int  DEFAULT 20,
  p_offset   int  DEFAULT 0
)
RETURNS TABLE (
  id           bigint,
  title        text,
  price        int,
  shipping_fee int,
  category     text,
  images       text[],
  items        jsonb,
  created_at   timestamptz,
  sold_count   int,
  seller_id    uuid,
  seller_name  text,
  seller_avatar text,
  tier_name    text,
  tier_key     int,
  success_rate numeric,
  deposit      int,
  is_pro       boolean,
  ad_slots     text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    l.id, l.title, l.price, l.shipping_fee, l.category, l.images, l.items,
    l.created_at, l.sold_count,
    l.seller_id,
    CASE WHEN l.is_official THEN '吉吉比官方' ELSE COALESCE(u.name, '玩家') END,
    CASE WHEN l.is_official THEN NULL ELSE u.avatar_url END,
    CASE WHEN l.is_official THEN NULL ELSE public.sell_seller_tier(l.seller_id) ->> 'name' END,
    CASE WHEN l.is_official THEN NULL ELSE (public.sell_seller_tier(l.seller_id) ->> 'k')::int END,
    CASE WHEN l.is_official THEN NULL ELSE s.success_rate END,
    -- 卡片顯示的是「這件賣掉會押多少」，用最低價規格當代表，跟卡片標價一致
    CASE WHEN l.is_official THEN 0
         ELSE public.sell_deposit_for(l.seller_id, l.price) END,
    CASE WHEN l.is_official THEN false ELSE public.sell_is_pro(l.seller_id) END,
    COALESCE(ARRAY(SELECT a.slot_id FROM public.sell_ads_live a WHERE a.listing_id = l.id), '{}')
  FROM public.sell_listings l
  LEFT JOIN public.users u ON u.id = l.seller_id
  LEFT JOIN public.sell_seller_stats s ON s.seller_id = l.seller_id
  WHERE l.status = 'active'
    AND l.is_official = COALESCE(p_official, false)
    AND (p_category IS NULL OR p_category = '' OR l.category = p_category)
    AND (
      p_search IS NULL OR btrim(p_search) = ''
      OR l.title ILIKE '%' || btrim(p_search) || '%'
      OR COALESCE(u.name,'') ILIKE '%' || btrim(p_search) || '%'
    )
  -- 有買廣告的排前面，其餘照新到舊
  ORDER BY (EXISTS (SELECT 1 FROM public.sell_ads_live a WHERE a.listing_id = l.id)) DESC,
           l.created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 20), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

-- 我的賣場：等級、統計、保證金鎖定總額，一次拿完
CREATE OR REPLACE FUNCTION public.sell_my_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid  uuid;
  v_tier jsonb;
  v_stat RECORD;
  v_lock int;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '請先登入');
  END IF;

  v_tier := public.sell_seller_tier(v_uid);
  SELECT done_count, failed_count, success_rate, avg_ship_minutes INTO v_stat
  FROM public.sell_seller_stats WHERE seller_id = v_uid;

  SELECT COALESCE(SUM(amount), 0) INTO v_lock
  FROM public.sell_deposits WHERE seller_id = v_uid AND status = 'locked';

  RETURN jsonb_build_object(
    'success', true,
    'tier', v_tier,
    'done_count', COALESCE(v_stat.done_count, 0),
    'failed_count', COALESCE(v_stat.failed_count, 0),
    'success_rate', COALESCE(v_stat.success_rate, 100),
    'avg_ship_minutes', COALESCE(v_stat.avg_ship_minutes, 0),
    'locked_deposit', v_lock,
    'is_pro', public.sell_is_pro(v_uid),
    'tokens', (SELECT tokens FROM public.users WHERE id = v_uid)
  );
END;
$$;

COMMIT;
