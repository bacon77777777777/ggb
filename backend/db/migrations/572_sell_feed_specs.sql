-- 572_sell_feed_specs.sql
--
-- sell_feed 補回傳 specs（兩層規格樹）與 condition（商品狀態）。
-- 接線第二批要把引擎的假資料換成真資料，而引擎的 skus()／minP()／totQ()
-- 直接吃 specs —— 少了它前台就只能顯示單一價格、選不了規格。
--
-- 欄位追加在最後面，既有呼叫端（依名稱取值）不受影響。

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
  id bigint, title text, note text, price int, shipping_fee int, category text,
  images text[], items jsonb, created_at timestamptz, sold_count int,
  seller_id uuid, seller_name text, seller_avatar text,
  tier_name text, tier_key int, success_rate numeric,
  done_count bigint, avg_ship_minutes int, deposit int, is_pro boolean,
  pay_method text, phone_verified boolean, ad_slots text[],
  specs jsonb, condition text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    l.id, l.title, l.note, l.price, l.shipping_fee, l.category, l.images, l.items,
    l.created_at, l.sold_count, l.seller_id,
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
    COALESCE(ARRAY(SELECT a.slot_id FROM public.sell_ads_live a WHERE a.listing_id = l.id), '{}'),
    l.specs, l.condition
  FROM public.sell_listings l
  LEFT JOIN public.users u ON u.id = l.seller_id
  LEFT JOIN public.sell_seller_stats s ON s.seller_id = l.seller_id
  LEFT JOIN public.sell_seller_profiles p ON p.seller_id = l.seller_id
  WHERE l.status = 'active'
    AND l.is_official = COALESCE(p_official, false)
    AND (p_category IS NULL OR p_category = '' OR l.category = p_category)
    AND (p_search IS NULL OR btrim(p_search) = ''
         OR l.title ILIKE '%' || btrim(p_search) || '%'
         OR COALESCE(u.name,'') ILIKE '%' || btrim(p_search) || '%')
  ORDER BY (EXISTS (SELECT 1 FROM public.sell_ads_live a WHERE a.listing_id = l.id)) DESC,
           l.created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 20), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

COMMIT;
