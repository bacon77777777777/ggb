-- 466: 補 STG 缺的 users.birthday，並把 check_achievements 兩環境對齊
--
-- 465 收尾時實跑 check_achievements 驗證，PROD 正常、STG 直接炸：
--   ERROR: column "birthday" does not exist  (line 12)
-- 爆在函數開頭取用戶欄位那段，跟 465 的改動無關 —— 是 STG 一直如此，
-- 也就是**STG 上成就從來沒有解鎖過**，這半年在 STG 測成就都是測心酸的。
--
-- users 欄位 diff（只有這一項是真的缺）：
--   PROD 有 / STG 沒有：birthday
--   STG 有 / PROD 沒有：cvs_recipient_name、cvs_recipient_phone、
--                        cvs_store_address、cvs_store_id、cvs_store_name（STG 舊殘留，不動）
--
-- 順便把函數本體對齊 PROD 版。STG 的舊版少兩件事：
--   1. COALESCE(total_worships, 0)，所以「排行榜信徒」勳章（膜拜 50 次）
--      永遠判不出來 —— 而膜拜正是 464 剛修好的
--   2. SET search_path TO 'public'
-- 下面直接寫 PROD 目前（套完 465 之後）的完整定義，兩環境跑完就是同一份。

ALTER TABLE users ADD COLUMN IF NOT EXISTS birthday DATE;

CREATE OR REPLACE FUNCTION public.check_achievements(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user           RECORD;
  v_badge          RECORD;
  v_newly_earned   TEXT[] := '{}';
  v_new_titles     TEXT[] := '{}';
  v_points_gained  INTEGER := 0;
  v_top_today      INTEGER;
  v_day_draws      INTEGER;
BEGIN
  SELECT total_draws, total_spent, total_topup, login_streak, draw_streak,
         topup_streak, total_referrals, top_prize_count, duplicate_count,
         birthday, points, COALESCE(total_worships, 0) AS total_worships
  INTO v_user
  FROM public.users
  WHERE id = p_user_id;

  IF NOT FOUND THEN RETURN '{"error":"user_not_found"}'::JSONB; END IF;

  SELECT COUNT(*) INTO v_day_draws
  FROM public.draw_records
  WHERE user_id = p_user_id
    AND created_at >= date_trunc('day', NOW())
    AND COALESCE(prize_level, '') <> 'coin_return';

  SELECT COUNT(*) INTO v_top_today
  FROM public.draw_records dr
  WHERE dr.user_id = p_user_id
    AND dr.created_at >= date_trunc('day', NOW())
    AND dr.prize_level IN ('S','SS','SSR','A','特賞','頭賞','Last One','LAST ONE','最後賞');

  FOR v_badge IN
    SELECT b.id, b.condition_type, b.condition_value, b.points_reward
    FROM public.badges b
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_badges ub
      WHERE ub.user_id = p_user_id AND ub.badge_id = b.id
    )
  LOOP
    DECLARE
      v_met BOOLEAN := FALSE;
    BEGIN
      CASE v_badge.condition_type
        WHEN 'total_draws'      THEN v_met := v_user.total_draws      >= v_badge.condition_value;
        WHEN 'login_streak'     THEN v_met := v_user.login_streak     >= v_badge.condition_value;
        WHEN 'draw_streak'      THEN v_met := v_user.draw_streak      >= v_badge.condition_value;
        WHEN 'total_topup'      THEN v_met := COALESCE(v_user.total_topup,0) >= v_badge.condition_value;
        WHEN 'topup_streak'     THEN v_met := v_user.topup_streak     >= v_badge.condition_value;
        WHEN 'total_referrals'  THEN v_met := v_user.total_referrals  >= v_badge.condition_value;
        WHEN 'top_prize_count'  THEN v_met := v_user.top_prize_count  >= v_badge.condition_value;
        WHEN 'duplicate_count'  THEN v_met := v_user.duplicate_count  >= v_badge.condition_value;
        WHEN 'single_day_draws' THEN v_met := v_day_draws             >= v_badge.condition_value;
        WHEN 'top_prize_day3'   THEN v_met := v_top_today             >= v_badge.condition_value;
        WHEN 'like_ranking'     THEN v_met := v_user.total_worships   >= v_badge.condition_value;
        WHEN 'top_prize_first'  THEN
          v_met := v_user.top_prize_count >= 1 AND v_user.total_draws = 1;
        WHEN 'birthday_draw'    THEN
          v_met := v_user.birthday IS NOT NULL
            AND to_char(v_user.birthday, 'MM-DD') = to_char(NOW(), 'MM-DD')
            AND v_day_draws >= 1;
        ELSE v_met := FALSE;
      END CASE;

      IF v_met THEN
        INSERT INTO public.user_badges (user_id, badge_id)
        VALUES (p_user_id, v_badge.id)
        ON CONFLICT DO NOTHING;

        v_newly_earned  := array_append(v_newly_earned, v_badge.id);
        v_points_gained := v_points_gained + v_badge.points_reward;

        INSERT INTO public.user_titles (user_id, title_id, is_selected)
        SELECT p_user_id, t.id, FALSE
        FROM public.titles t
        WHERE t.badge_id = v_badge.id
        ON CONFLICT DO NOTHING;

        SELECT array_agg(t.id) INTO v_new_titles
        FROM public.titles t
        WHERE t.badge_id = v_badge.id;
      END IF;
    END;
  END LOOP;

  IF v_points_gained > 0 THEN
    UPDATE public.users
    SET points = COALESCE(points, 0) + v_points_gained
    WHERE id = p_user_id;
  END IF;

  RETURN jsonb_build_object(
    'newly_earned',  v_newly_earned,
    'new_titles',    v_new_titles,
    'points_gained', v_points_gained
  );
END;
$function$

;
