-- 675: 交易所逛街清單補 product_series（products.series 的短系列名）
-- 老闆 2026-09-02：「系列商品名稱太長了，參照首頁那樣，寶可夢、三麗鷗這樣簡短的」。
-- 首頁二級頁籤吃的就是 products.series；交易所之前拿 product_name（整檔商品名）當系列，
-- 一長串塞不進膠囊。CREATE OR REPLACE 只在尾端加欄，既有欄位順序不動。

CREATE OR REPLACE VIEW public.public_marketplace_listings AS
SELECT l.id,
       l.price,
       l.seller_id,
       l.created_at,
       COALESCE(u.name, '玩家'::text) AS seller_name,
       u.avatar_url AS seller_avatar,
       COALESCE(pp.name, '未知品項'::character varying) AS prize_name,
       COALESCE(pp.level, ''::character varying) AS prize_level,
       pp.image_url AS prize_image,
       COALESCE(p.name, ''::text) AS product_name,
       p.type AS product_type,
       dr.product_prize_id,
       pp.total AS prize_total,
       COALESCE(p.series, ''::text) AS product_series
FROM marketplace_listings l
  LEFT JOIN draw_records dr ON dr.id = l.draw_record_id
  LEFT JOIN product_prizes pp ON pp.id = dr.product_prize_id
  LEFT JOIN products p ON p.id = dr.product_id
  LEFT JOIN users u ON u.id = l.seller_id
WHERE l.status::text = 'active'::text;
