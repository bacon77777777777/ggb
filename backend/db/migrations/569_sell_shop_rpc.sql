-- 569_sell_shop_rpc.sql
--
-- 個人店舖頁（/sell/shop/<sellerId>）與商品彈層深連結需要的兩支 RPC。
--
-- 為什麼不直接查表：sell_seller_stats view join 了有 RLS 的 users 與 sell_orders，
-- 前台直接查會被濾成空的（同 566 的理由）。跟 sell_feed 一樣走 SECURITY DEFINER。
--
-- 回傳欄位刻意跟 sell_feed（566 版）完全同形 —— 前台同一個 FeedRow 型別、
-- 同一套卡片元件直接吃，不用再開一種資料形狀。

BEGIN;

-- ── 店舖頁：某賣家的上架中商品 ──
CREATE OR REPLACE FUNCTION public.sell_shop_feed(
  p_seller uuid,
  p_limit  int DEFAULT 30,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id            bigint,
  title         text,
  note          text,
  price         int,
  shipping_fee  int,
  category      text,
  images        text[],
  items         jsonb,
  created_at    timestamptz,
  sold_count    int,
  seller_id     uuid,
  seller_name   text,
  seller_avatar text,
  tier_name     text,
  tier_key      int,
  success_rate  numeric,
  done_count    bigint,
  avg_ship_minutes int,
  deposit       int,
  is_pro        boolean,
  pay_method    text,
  phone_verified boolean,
  ad_slots      text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    l.id, l.title, l.note, l.price, l.shipping_fee, l.category, l.images, l.items,
    l.created_at, l.sold_count,
    l.seller_id,
    COALESCE(u.name, '玩家'),
    u.avatar_url,
    public.sell_seller_tier(l.seller_id) ->> 'name',
    (public.sell_seller_tier(l.seller_id) ->> 'k')::int,
    s.success_rate,
    s.done_count,
    s.avg_ship_minutes,
    public.sell_deposit_for(l.seller_id, l.price),
    public.sell_is_pro(l.seller_id),
    p.payout_method,
    COALESCE(u.is_phone_verified, false),
    COALESCE(ARRAY(SELECT a.slot_id FROM public.sell_ads_live a WHERE a.listing_id = l.id), '{}')
  FROM public.sell_listings l
  LEFT JOIN public.users u ON u.id = l.seller_id
  LEFT JOIN public.sell_seller_stats s ON s.seller_id = l.seller_id
  LEFT JOIN public.sell_seller_profiles p ON p.seller_id = l.seller_id
  WHERE l.status = 'active'
    AND l.is_official = false
    AND l.seller_id = p_seller
  ORDER BY l.created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 30), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

-- ── 店舖頁抬頭：賣家本人資料與統計（沒有任何上架也要有，不能從商品列推） ──
CREATE OR REPLACE FUNCTION public.sell_shop_header(p_seller uuid)
RETURNS TABLE (
  seller_id     uuid,
  seller_name   text,
  seller_avatar text,
  tier_name     text,
  tier_key      int,
  success_rate  numeric,
  done_count    bigint,
  avg_ship_minutes int,
  is_pro        boolean,
  phone_verified boolean,
  suspended     boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    u.id,
    COALESCE(u.name, '玩家'),
    u.avatar_url,
    public.sell_seller_tier(u.id) ->> 'name',
    (public.sell_seller_tier(u.id) ->> 'k')::int,
    s.success_rate,
    s.done_count,
    s.avg_ship_minutes,
    public.sell_is_pro(u.id),
    COALESCE(u.is_phone_verified, false),
    (p.suspended_at IS NOT NULL)
  FROM public.users u
  LEFT JOIN public.sell_seller_stats s ON s.seller_id = u.id
  LEFT JOIN public.sell_seller_profiles p ON p.seller_id = u.id
  WHERE u.id = p_seller;
$$;

-- ── 商品彈層深連結（店舖頁點卡片 → /sell?open=<id>，不在已載入的 feed 裡也開得起來） ──
CREATE OR REPLACE FUNCTION public.sell_feed_one(p_id bigint)
RETURNS TABLE (
  id            bigint,
  title         text,
  note          text,
  price         int,
  shipping_fee  int,
  category      text,
  images        text[],
  items         jsonb,
  created_at    timestamptz,
  sold_count    int,
  seller_id     uuid,
  seller_name   text,
  seller_avatar text,
  tier_name     text,
  tier_key      int,
  success_rate  numeric,
  done_count    bigint,
  avg_ship_minutes int,
  deposit       int,
  is_pro        boolean,
  pay_method    text,
  phone_verified boolean,
  ad_slots      text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    l.id, l.title, l.note, l.price, l.shipping_fee, l.category, l.images, l.items,
    l.created_at, l.sold_count,
    l.seller_id,
    CASE WHEN l.is_official THEN '吉吉比官方' ELSE COALESCE(u.name, '玩家') END,
    CASE WHEN l.is_official THEN NULL ELSE u.avatar_url END,
    CASE WHEN l.is_official THEN NULL ELSE public.sell_seller_tier(l.seller_id) ->> 'name' END,
    CASE WHEN l.is_official THEN NULL ELSE (public.sell_seller_tier(l.seller_id) ->> 'k')::int END,
    CASE WHEN l.is_official THEN NULL ELSE s.success_rate END,
    CASE WHEN l.is_official THEN NULL ELSE s.done_count END,
    CASE WHEN l.is_official THEN NULL ELSE s.avg_ship_minutes END,
    CASE WHEN l.is_official THEN 0 ELSE public.sell_deposit_for(l.seller_id, l.price) END,
    CASE WHEN l.is_official THEN false ELSE public.sell_is_pro(l.seller_id) END,
    CASE WHEN l.is_official THEN NULL ELSE p.payout_method END,
    CASE WHEN l.is_official THEN true ELSE COALESCE(u.is_phone_verified, false) END,
    COALESCE(ARRAY(SELECT a.slot_id FROM public.sell_ads_live a WHERE a.listing_id = l.id), '{}')
  FROM public.sell_listings l
  LEFT JOIN public.users u ON u.id = l.seller_id
  LEFT JOIN public.sell_seller_stats s ON s.seller_id = l.seller_id
  LEFT JOIN public.sell_seller_profiles p ON p.seller_id = l.seller_id
  WHERE l.id = p_id AND l.status = 'active';
$$;

COMMIT;
