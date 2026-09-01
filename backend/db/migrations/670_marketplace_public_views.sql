-- 670：交易所前台要用的兩個公開 view（老闆 2026-09-01 交易所改版）
--
-- ① public_marketplace_listings 補三個欄位
--    ・product_prize_id —— 前台要拿它去撈「同款最近成交價」。不是敏感資料
--      （籤號、種子雜湊在 draw_records，那些一樣不曝露）
--    ・product_type     —— 已有，保留
--    ・prize_total      —— 品項初始總數，前台用來標「稀有」
--
-- ② public_marketplace_price_stats —— 同款成交行情
--    marketplace_transactions 的 RLS 是「只有買賣雙方看得到」，所以逛街的人
--    看不到任何行情。但「這件別人賣多少」正是交易所最該給的資訊 ——
--    沒有它，賣家亂開價、買家不知道貴不貴，兩邊都不敢動。
--    view 只給彙總（筆數／最近／平均／最低最高），不曝露是誰買誰賣。

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
  p.type                        AS product_type,
  dr.product_prize_id           AS product_prize_id,
  pp.total                      AS prize_total
FROM public.marketplace_listings l
LEFT JOIN public.draw_records   dr ON dr.id = l.draw_record_id
LEFT JOIN public.product_prizes pp ON pp.id = dr.product_prize_id
LEFT JOIN public.products       p  ON p.id  = dr.product_id
LEFT JOIN public.users          u  ON u.id  = l.seller_id
WHERE l.status = 'active';

GRANT SELECT ON public.public_marketplace_listings TO anon, authenticated;

COMMENT ON VIEW public.public_marketplace_listings IS
  '交易所的公開清單。只含在架上的，且只曝露逛街要用的欄位 —— 不含籤號、種子雜湊與賣家的其他資料。';

-- ── 同款成交行情（彙總，不曝露交易對象）──────────────────────
CREATE OR REPLACE VIEW public.public_marketplace_price_stats AS
SELECT
  dr.product_prize_id                              AS product_prize_id,
  COUNT(*)                                         AS deal_count,
  MIN(t.price)                                     AS min_price,
  MAX(t.price)                                     AS max_price,
  ROUND(AVG(t.price))::int                         AS avg_price,
  (ARRAY_AGG(t.price ORDER BY t.created_at DESC))[1] AS last_price,
  MAX(t.created_at)                                AS last_deal_at
FROM public.marketplace_transactions t
JOIN public.draw_records dr ON dr.id = t.draw_record_id
WHERE dr.product_prize_id IS NOT NULL
  AND t.created_at > NOW() - INTERVAL '90 days'
GROUP BY dr.product_prize_id;

GRANT SELECT ON public.public_marketplace_price_stats TO anon, authenticated;

COMMENT ON VIEW public.public_marketplace_price_stats IS
  '交易所同款品項的近 90 天成交行情（彙總）。marketplace_transactions 本身只有買賣雙方讀得到，這裡只給統計數字，不曝露交易對象。';
