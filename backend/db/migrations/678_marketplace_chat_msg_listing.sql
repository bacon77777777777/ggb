-- 678: 聊聊訊息逐則帶商品資訊（老闆 2026-09-02：「我問了不同商品，下方要延續帶不同商品資訊」）
-- 677 併成一人一串之後，同一串裡會聊到多件商品 —— 前端要在換件的地方插商品小卡，
-- 所以逐則回 listing 的品名／圖／價格（訊息本來就記著 listing_id）。

DROP FUNCTION IF EXISTS public.marketplace_chat_thread(uuid);
CREATE OR REPLACE FUNCTION public.marketplace_chat_thread(p_other uuid)
RETURNS TABLE(
  id bigint, body text, kind text, from_me boolean, created_at timestamp with time zone,
  listing_id bigint, prize_name text, prize_image text, price integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT m.id, m.body, m.kind, (m.sender_id = auth.uid()), m.created_at,
         m.listing_id,
         pp.name::text, pp.image_url, ml.price
    FROM marketplace_messages m
    LEFT JOIN marketplace_listings ml ON ml.id = m.listing_id
    LEFT JOIN draw_records   dr ON dr.id = ml.draw_record_id
    LEFT JOIN product_prizes pp ON pp.id = dr.product_prize_id
   WHERE auth.uid() IS NOT NULL
     AND ((m.sender_id = auth.uid() AND m.receiver_id = p_other)
       OR (m.sender_id = p_other    AND m.receiver_id = auth.uid()))
   ORDER BY m.created_at
   LIMIT 300;
$$;
