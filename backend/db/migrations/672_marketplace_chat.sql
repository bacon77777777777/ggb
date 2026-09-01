-- 672：交易所聊聊（老闆 2026-09-01「最右邊箱子圖標移除，改聊聊」）
--
-- `marketplace_messages` 這張表 175 就建好了，RLS 也對（只有收發雙方看得到），
-- 但全站沒有任何程式碼寫入或讀取它 —— 買家想問賣家「這件有盒損嗎」沒有地方問。
--
-- 三支 RPC 補齊。為什麼要 SECURITY DEFINER：
-- 訊息本身靠 RLS 讀得到，但**對方的暱稱與頭像讀不到** —— users 的 RLS 是
-- 「只看得到自己的」，join 回來會是一排沒有名字的對話。同 671 的處理方式。

-- ─────────────────────────────────────────────────────────────
-- 對話列表
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.my_marketplace_chats()
RETURNS TABLE (
  listing_id        bigint,
  listing_status    text,
  other_id          uuid,
  other_name        text,
  other_avatar      text,
  prize_name        text,
  prize_image       text,
  price             integer,
  last_body         text,
  last_at           timestamptz,
  last_from_me      boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH mine AS (
    SELECT m.*,
           CASE WHEN m.sender_id = auth.uid() THEN m.receiver_id ELSE m.sender_id END AS other
      FROM marketplace_messages m
     WHERE auth.uid() IS NOT NULL
       AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
  ), last AS (
    SELECT DISTINCT ON (listing_id, other) *
      FROM mine
     ORDER BY listing_id, other, created_at DESC
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

-- ─────────────────────────────────────────────────────────────
-- 單一對話
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.marketplace_chat_thread(p_listing_id bigint, p_other uuid)
RETURNS TABLE (
  id         bigint,
  body       text,
  kind       text,
  from_me    boolean,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.body, m.kind, (m.sender_id = auth.uid()), m.created_at
    FROM marketplace_messages m
   WHERE auth.uid() IS NOT NULL
     AND m.listing_id = p_listing_id
     AND ((m.sender_id = auth.uid() AND m.receiver_id = p_other)
       OR (m.sender_id = p_other    AND m.receiver_id = auth.uid()))
   ORDER BY m.created_at
   LIMIT 300;
$$;

-- ─────────────────────────────────────────────────────────────
-- 送出訊息
--
-- 只允許「跟這件上架有關係的兩個人」對話：收發雙方必須有一邊是賣家。
-- 不然任何人都能拿別人的上架編號當管道去騷擾任意帳號。
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.marketplace_send_message(
  p_listing_id bigint,
  p_to         uuid,
  p_body       text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me   uuid := auth.uid();
  v_lst  RECORD;
  v_body text;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '請先登入');
  END IF;

  v_body := btrim(COALESCE(p_body, ''));
  IF v_body = '' THEN
    RETURN jsonb_build_object('success', false, 'message', '訊息不能是空的');
  END IF;
  IF length(v_body) > 500 THEN
    RETURN jsonb_build_object('success', false, 'message', '訊息太長了（上限 500 字）');
  END IF;
  IF p_to IS NULL OR p_to = v_me THEN
    RETURN jsonb_build_object('success', false, 'message', '找不到聊天對象');
  END IF;

  SELECT * INTO v_lst FROM marketplace_listings WHERE id = p_listing_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', '找不到這筆上架');
  END IF;
  IF v_lst.seller_id <> v_me AND v_lst.seller_id <> p_to THEN
    RETURN jsonb_build_object('success', false, 'message', '只能跟這件的賣家聊');
  END IF;

  INSERT INTO marketplace_messages (listing_id, sender_id, receiver_id, kind, body)
  VALUES (p_listing_id, v_me, p_to, 'text', v_body);

  RETURN jsonb_build_object('success', true, 'message', '');
END;
$$;

REVOKE ALL ON FUNCTION public.my_marketplace_chats()                          FROM public;
REVOKE ALL ON FUNCTION public.marketplace_chat_thread(bigint, uuid)           FROM public;
REVOKE ALL ON FUNCTION public.marketplace_send_message(bigint, uuid, text)    FROM public;
GRANT EXECUTE ON FUNCTION public.my_marketplace_chats()                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_chat_thread(bigint, uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_send_message(bigint, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.my_marketplace_chats() IS
  '交易所聊聊的對話列表。對方的暱稱／頭像被 users 的 RLS 擋著，所以走 SECURITY DEFINER。';
