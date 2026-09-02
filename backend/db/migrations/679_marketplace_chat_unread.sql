-- 679: 聊聊未讀數（老闆 2026-09-02：「時間下方要有未讀數量膠囊，跟 LINE 一樣」）
-- marketplace_messages 補 read_at；列表 RPC 回每個對象的未讀數；開對話就整串標已讀。

ALTER TABLE public.marketplace_messages ADD COLUMN IF NOT EXISTS read_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_marketplace_messages_unread
  ON public.marketplace_messages (receiver_id, sender_id) WHERE read_at IS NULL;

-- 開對話：把對方發給我的整串標已讀
CREATE OR REPLACE FUNCTION public.marketplace_mark_read(p_other uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE marketplace_messages
     SET read_at = now()
   WHERE auth.uid() IS NOT NULL
     AND receiver_id = auth.uid()
     AND sender_id = p_other
     AND read_at IS NULL;
$$;

-- 列表補 unread_count（欄位加在尾端，前端舊版讀不到也不會壞）
DROP FUNCTION IF EXISTS public.my_marketplace_chats();
CREATE OR REPLACE FUNCTION public.my_marketplace_chats()
RETURNS TABLE(
  listing_id bigint, listing_status text, other_id uuid, other_name text, other_avatar text,
  prize_name text, prize_image text, price integer,
  last_body text, last_at timestamp with time zone, last_from_me boolean,
  unread_count integer
)
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
  ), unread AS (
    SELECT sender_id AS other, count(*)::int AS n
      FROM marketplace_messages
     WHERE receiver_id = auth.uid() AND read_at IS NULL
     GROUP BY sender_id
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
    (l.sender_id = auth.uid()),
    COALESCE(ur.n, 0)
  FROM last l
  LEFT JOIN marketplace_listings ml ON ml.id = l.listing_id
  LEFT JOIN draw_records   dr ON dr.id = ml.draw_record_id
  LEFT JOIN product_prizes pp ON pp.id = dr.product_prize_id
  LEFT JOIN users u ON u.id = l.other
  LEFT JOIN unread ur ON ur.other = l.other
  ORDER BY l.created_at DESC
  LIMIT 100;
$$;
