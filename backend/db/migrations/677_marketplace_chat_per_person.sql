-- 677: 交易所聊聊改「一人一串」（老闆 2026-09-02：「怎麼同一個人兩個聊天訊息？」）
--
-- 672 的設計是（listing, 對方）一串 —— 跟同一個賣家聊兩件商品就出現兩列。
-- 改成照 LINE／蝦皮的心智模型：對話跟「人」走，一個對象一串；
-- 每則訊息仍帶 listing_id（知道當時在聊哪件），列表的商品預覽取最新那則的。

-- 對話內容：只認對象，不再分商品
DROP FUNCTION IF EXISTS public.marketplace_chat_thread(bigint, uuid);
CREATE OR REPLACE FUNCTION public.marketplace_chat_thread(p_other uuid)
RETURNS TABLE(id bigint, body text, kind text, from_me boolean, created_at timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT m.id, m.body, m.kind, (m.sender_id = auth.uid()), m.created_at
    FROM marketplace_messages m
   WHERE auth.uid() IS NOT NULL
     AND ((m.sender_id = auth.uid() AND m.receiver_id = p_other)
       OR (m.sender_id = p_other    AND m.receiver_id = auth.uid()))
   ORDER BY m.created_at
   LIMIT 300;
$$;

-- 對話列表：一個對象一列（取最新一則訊息＋它繫的商品當預覽）。回傳欄位形狀不變，前端不用改型別
CREATE OR REPLACE FUNCTION public.my_marketplace_chats()
RETURNS TABLE(listing_id bigint, listing_status text, other_id uuid, other_name text, other_avatar text, prize_name text, prize_image text, price integer, last_body text, last_at timestamp with time zone, last_from_me boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH mine AS (
    SELECT m.*,
           CASE WHEN m.sender_id = auth.uid() THEN m.receiver_id ELSE m.sender_id END AS other
      FROM marketplace_messages m
     WHERE auth.uid() IS NOT NULL
       AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
  ), last AS (
    SELECT DISTINCT ON (other) *
      FROM mine
     ORDER BY other, created_at DESC
  )
  SELECT
    l.listing_id,
    ml.status::text,
    l.other,
    COALESCE(u.name, '玩家'),
    u.avatar_url,
    COALESCE(pp.name, '未知品項'),
    pp.image_url,
    ml.price,
    l.body,
    l.created_at,
    (l.sender_id = auth.uid())
  FROM last l
  LEFT JOIN marketplace_listings ml ON ml.id = l.listing_id
  LEFT JOIN draw_records   dr ON dr.id = ml.draw_record_id
  LEFT JOIN product_prizes pp ON pp.id = dr.product_prize_id
  LEFT JOIN users u ON u.id = l.other
  ORDER BY l.created_at DESC
  LIMIT 100;
$$;
