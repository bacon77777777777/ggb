-- 614: 曬圖帶玩家頭像（老闆 2026-08-24）
--
-- 底圖左下角那個黑色圓角框本來就是為頭像＋暱稱＋時間設計的（舊版樣稿裡有畫），
-- 但 get_prize_share_data 只回 player_name，前台畫不出頭像。這裡把 users.avatar_url 一併帶出來。
--
-- avatar_url 有三種形態：NULL（沒設過）、站內路徑（/images/avatar/03.webp，預設頭像）、
-- 外部網址（R2 上傳的自訂頭像、LINE 登入帶回來的 profile.line-scdn.net）。
-- 前台負責分辨：外部網址走同源代理，站內路徑直接用，NULL 退預設頭像。

CREATE OR REPLACE FUNCTION public.get_prize_share_data(p_draw_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$

DECLARE
  v_uid    uuid := auth.uid();
  v_rec    RECORD;
  v_draws  integer;
  v_spent  integer;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;

  SELECT d.id, d.created_at, d.product_id, d.product_prize_id, d.prize_name, d.prize_level,
         d.prize_image_url,
         pp.name AS prize_name2, pp.image_url, pp.id AS pp_id,
         p.name AS product_name, p.type AS product_type,
         u.name AS player_name, u.avatar_url AS player_avatar
    INTO v_rec
  FROM public.draw_records d
  JOIN public.products p ON p.id = d.product_id
  LEFT JOIN public.product_prizes pp ON pp.id = d.product_prize_id
  LEFT JOIN public.users u ON u.id = d.user_id
  WHERE d.id = p_draw_id AND d.user_id = v_uid;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- 玩家在這件商品上的抽數與花費（曬圖上的兩個數字）
  SELECT COUNT(*), COALESCE(SUM(GREATEST(COALESCE(d.tokens_spent, 0), 0)), 0)
    INTO v_draws, v_spent
  FROM public.draw_records d
  WHERE d.user_id = v_uid AND d.product_id = v_rec.product_id;

  RETURN jsonb_build_object(
    'draw_id',      v_rec.id,
    'is_major',     public.is_major_prize(v_rec.pp_id),
    'prize_name',   COALESCE(v_rec.prize_name2, v_rec.prize_name, ''),
    'prize_level',  COALESCE(v_rec.prize_level, ''),
    'prize_image',  COALESCE(v_rec.image_url, v_rec.prize_image_url),
    'product_name', v_rec.product_name,
    'product_type', v_rec.product_type,
    'player_name',  COALESCE(v_rec.player_name, ''),
    'player_avatar', v_rec.player_avatar,
    'won_at',       v_rec.created_at,
    'draw_count',   v_draws,
    'total_spent',  v_spent
  );
END;

$function$;
