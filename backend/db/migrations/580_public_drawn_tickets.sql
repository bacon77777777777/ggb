-- 580_public_drawn_tickets.sql
--
-- 修：一番賞選籤畫面看不到「別人抽走的籤」，選下去按確認支付才被擋。
--
-- 成因：draw_records 的 RLS 只允許 `auth.uid() = user_id`，前台用 anon key
-- 直接 select 只會拿到自己的紀錄，別人抽走的籤在格子上仍是可選狀態；
-- 但 play_ichiban 是 SECURITY DEFINER，看得到全部，於是丟 TICKET_ALREADY_DRAWN。
-- 只要那件商品有第二個人抽過就會踩到。
--
-- 不改 RLS 放行整張表：那會連 user_id 與中獎明細都一起公開。
-- 改成一支 SECURITY DEFINER 的唯讀函式，只吐選籤畫面真正需要的三個欄位
-- （哪一號被抽走、抽出什麼獎）—— 這在一番賞本來就是公開資訊，牆上的賞位表就寫著。

BEGIN;

-- 回傳欄位含圖與最後賞旗標：選籤格、開籤結果一覽、最後賞查詢三處都吃這支
DROP FUNCTION IF EXISTS public.get_drawn_tickets(bigint);

CREATE OR REPLACE FUNCTION public.get_drawn_tickets(p_product_id bigint)
RETURNS TABLE (ticket_number int, prize_level text, prize_name text,
               prize_image_url text, is_last_one boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT d.ticket_number, d.prize_level, d.prize_name,
         d.prize_image_url, COALESCE(d.is_last_one, false)
  FROM public.draw_records d
  WHERE d.product_id = p_product_id
  ORDER BY d.ticket_number NULLS FIRST, d.id;
$$;

COMMENT ON FUNCTION public.get_drawn_tickets(bigint) IS
  '一番賞選籤畫面用：回傳某商品已被抽走的籤號與獎項。不含 user_id，任何人可讀';

GRANT EXECUTE ON FUNCTION public.get_drawn_tickets(bigint) TO anon, authenticated;

COMMIT;
