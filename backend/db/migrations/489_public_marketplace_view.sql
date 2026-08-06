-- 489：交易所的公開清單
--
-- 買方要逛得到別人的上架，但 draw_records 與 users 的 RLS 都是「只看得到自己的」。
-- 直接查 marketplace_listings 再 join 過去的話，別人的上架會變成一張沒有圖、
-- 沒有名字、沒有賣家的空白卡片 —— 清單讀得到（那張表是公開的），
-- 但真正要顯示的東西全部被擋在關聯的表裡。
--
-- 解法跟 public_theme / public_maintenance 同一個模式：開一個 view，
-- 只曝露逛街需要的那幾個欄位。不能直接放寬 draw_records 的 RLS ——
-- 那張表裡有籤號、種子雜湊與每個人完整的抽獎歷史。

CREATE OR REPLACE VIEW public.public_marketplace_listings AS
SELECT
  l.id,
  l.price,
  l.seller_id,
  l.created_at,
  COALESCE(u.name, '玩家')      AS seller_name,
  u.avatar_url                  AS seller_avatar,
  COALESCE(pp.name, '未知品項') AS prize_name,
  COALESCE(pp.level, '')        AS prize_level,
  pp.image_url                  AS prize_image,
  COALESCE(p.name, '')          AS product_name,
  p.type                        AS product_type
FROM public.marketplace_listings l
LEFT JOIN public.draw_records   dr ON dr.id = l.draw_record_id
LEFT JOIN public.product_prizes pp ON pp.id = dr.product_prize_id
LEFT JOIN public.products       p  ON p.id  = dr.product_id
LEFT JOIN public.users          u  ON u.id  = l.seller_id
-- 只有在架上的才公開。已賣出與已下架的不該被別人翻出來
WHERE l.status = 'active';

GRANT SELECT ON public.public_marketplace_listings TO anon, authenticated;

COMMENT ON VIEW public.public_marketplace_listings IS
  '交易所的公開清單。只含在架上的，且只曝露逛街要用的欄位 —— 不含籤號、種子雜湊與賣家的其他資料。';
