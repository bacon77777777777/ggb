-- =============================================
-- check_achievements: 檢查並解鎖用戶成就
-- 呼叫時機：抽蛋、儲值、登入後
-- =============================================

CREATE OR REPLACE FUNCTION public.check_achievements(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user           RECORD;
  v_badge          RECORD;
  v_newly_earned   TEXT[] := '{}';
  v_new_titles     TEXT[] := '{}';
  v_points_gained  INTEGER := 0;
  v_top_today      INTEGER;
  v_day_draws      INTEGER;
BEGIN
  -- 取用戶資料
  SELECT total_draws, total_spent, total_topup, login_streak, draw_streak,
         topup_streak, total_referrals, top_prize_count, duplicate_count,
         birthday, points
  INTO v_user
  FROM public.users
  WHERE id = p_user_id;

  IF NOT FOUND THEN RETURN '{"error":"user_not_found"}'::JSONB; END IF;

  -- 今日單日轉蛋數
  SELECT COUNT(*) INTO v_day_draws
  FROM public.draw_records
  WHERE user_id = p_user_id
    AND created_at >= date_trunc('day', NOW());

  -- 今日最高獎數（用 prize_level 欄位，不 join）
  SELECT COUNT(*) INTO v_top_today
  FROM public.draw_records dr
  WHERE dr.user_id = p_user_id
    AND dr.created_at >= date_trunc('day', NOW())
    AND dr.prize_level IN ('S','SS','SSR','A','特賞','頭賞','Last One','LAST ONE','最後賞');

  -- 逐一檢查所有勳章
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

        -- 若此勳章有對應稱號，解鎖
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

  -- 發放積分
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
$$;

-- =============================================
-- get_player_profile: 取排行榜玩家公開資料卡
-- =============================================

CREATE OR REPLACE FUNCTION public.get_player_profile(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user   RECORD;
  v_title  RECORD;
  v_badges JSONB;
BEGIN
  SELECT id, name, avatar_url, total_draws, total_spent
  INTO v_user
  FROM public.users
  WHERE id = p_user_id;

  IF NOT FOUND THEN RETURN '{"error":"not_found"}'::JSONB; END IF;

  -- 選中的稱號
  SELECT t.id, t.name, t.color_key INTO v_title
  FROM public.user_titles ut
  JOIN public.titles t ON ut.title_id = t.id
  WHERE ut.user_id = p_user_id AND ut.is_selected = TRUE
  LIMIT 1;

  -- 已獲得的勳章（附上所有勳章定義讓前端知道哪些鎖定）
  SELECT jsonb_agg(
    jsonb_build_object(
      'id',        b.id,
      'name',      b.name,
      'icon',      b.icon,
      'category',  b.category,
      'earned',    (ub.badge_id IS NOT NULL),
      'earned_at', ub.earned_at,
      'sort_order',b.sort_order
    ) ORDER BY b.sort_order
  ) INTO v_badges
  FROM public.badges b
  LEFT JOIN public.user_badges ub ON ub.badge_id = b.id AND ub.user_id = p_user_id;

  RETURN jsonb_build_object(
    'id',          v_user.id,
    'nickname',    COALESCE(v_user.name, '神秘玩家'),
    'avatar_url',  v_user.avatar_url,
    'total_draws', v_user.total_draws,
    'total_spent', v_user.total_spent,
    'title',       CASE WHEN v_title.id IS NOT NULL
                     THEN jsonb_build_object('id', v_title.id, 'name', v_title.name, 'color_key', v_title.color_key)
                     ELSE NULL END,
    'badges',      COALESCE(v_badges, '[]'::JSONB)
  );
END;
$$;
