-- 578_sell_feed_one_specs.sql
--
-- 商城商品詳情改成獨立頁（/sell/<id>）：頁面自己用 sell_feed_one 載入一件商品，
-- 不再依賴首頁 feed 已經載好的前 60 筆。
--
-- 569 版的 sell_feed_one 回傳形狀停在 items 那一代，缺 572 之後 sell_feed 才補的
-- specs（兩層規格樹）與 condition，引擎的 skus()／minP() 吃不到就選不了規格；
-- 另補 is_official，前端才知道要走玩家商城還是官方商城的版型。
--
-- 欄位追加在最後面，既有呼叫端（依名稱取值）不受影響。

BEGIN;

DROP FUNCTION IF EXISTS public.sell_feed_one(bigint);

CREATE OR REPLACE FUNCTION public.sell_feed_one(p_id bigint)
RETURNS TABLE (
  id bigint, title text, note text, price int, shipping_fee int, category text,
  images text[], items jsonb, created_at timestamptz, sold_count int,
  seller_id uuid, seller_name text, seller_avatar text,
  tier_name text, tier_key int, success_rate numeric,
  done_count bigint, avg_ship_minutes int, deposit int, is_pro boolean,
  pay_method text, phone_verified boolean, ad_slots text[],
  specs jsonb, condition text, is_official boolean
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
    l.specs, l.condition, l.is_official
  FROM public.sell_listings l
  LEFT JOIN public.users u ON u.id = l.seller_id
  LEFT JOIN public.sell_seller_stats s ON s.seller_id = l.seller_id
  LEFT JOIN public.sell_seller_profiles p ON p.seller_id = l.seller_id
  WHERE l.id = p_id AND l.status = 'active';
$$;

GRANT EXECUTE ON FUNCTION public.sell_feed_one(bigint) TO anon, authenticated;

COMMIT;
