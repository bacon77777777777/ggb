-- 565_sell_feed_pays.sql
--
-- sell_feed 補回傳賣家的收款方式。
--
-- 商品卡下方要顯示「免運 / 銀行轉帳 / LINE Pay」這排標籤 —— 買家在列表就要知道
-- 這個賣家收不收得到自己的錢（平台不碰錢，付款方式是賣家決定、買家不能挑）。
-- 沒有這個欄位的話前台得為每張卡再查一次 sell_seller_profiles。

BEGIN;

DROP FUNCTION IF EXISTS public.sell_feed(boolean, text, text, int, int);

CREATE OR REPLACE FUNCTION public.sell_feed(
  p_official boolean DEFAULT false,
  p_category text DEFAULT NULL,
  p_search   text DEFAULT NULL,
  p_limit    int  DEFAULT 20,
  p_offset   int  DEFAULT 0
)
RETURNS TABLE (
  id            bigint,
  title         text,
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
  deposit       int,
  is_pro        boolean,
  pay_method    text,
  ad_slots      text[]
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
    CASE WHEN l.is_official THEN 0
         ELSE public.sell_deposit_for(l.seller_id, l.price) END,
    CASE WHEN l.is_official THEN false ELSE public.sell_is_pro(l.seller_id) END,
    -- 只露「方式」不露帳號，跟 sell_seller_public 同一個原則
    CASE WHEN l.is_official THEN NULL ELSE p.payout_method END,
    COALESCE(ARRAY(SELECT a.slot_id FROM public.sell_ads_live a WHERE a.listing_id = l.id), '{}')
  FROM public.sell_listings l
  LEFT JOIN public.users u ON u.id = l.seller_id
  LEFT JOIN public.sell_seller_stats s ON s.seller_id = l.seller_id
  LEFT JOIN public.sell_seller_profiles p ON p.seller_id = l.seller_id
  WHERE l.status = 'active'
    AND l.is_official = COALESCE(p_official, false)
    AND (p_category IS NULL OR p_category = '' OR l.category = p_category)
    AND (
      p_search IS NULL OR btrim(p_search) = ''
      OR l.title ILIKE '%' || btrim(p_search) || '%'
      OR COALESCE(u.name,'') ILIKE '%' || btrim(p_search) || '%'
    )
  ORDER BY (EXISTS (SELECT 1 FROM public.sell_ads_live a WHERE a.listing_id = l.id)) DESC,
           l.created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 20), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

COMMIT;
