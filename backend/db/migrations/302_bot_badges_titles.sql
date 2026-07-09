-- ============================================================
-- 302_bot_badges_titles.sql
-- 為機器人帳號隨機配置徽章與稱號
-- 策略：
--   · 抽蛋徽章依實際 total_draws 給（階梯式，最多到該等級）
--   · 活躍/花費/社交/幸運/隱藏各類隨機選 0-2 個
--   · 每個 bot 隨機選一個已獲得稱號設為 is_selected
-- ============================================================

DO $$
DECLARE
  v_bot    RECORD;
  v_badge  TEXT;
  v_title  TEXT;
  -- 抽蛋階梯（by total_draws threshold）
  draw_badges TEXT[]  := ARRAY['first_draw','draw_30','draw_100','draw_500','draw_1000','draw_5000'];
  draw_thresh INTEGER[] := ARRAY[1, 30, 100, 500, 1000, 5000];
  -- 活躍（強制給 login_streak_7，其餘隨機）
  active_pool TEXT[] := ARRAY['login_streak_7','login_streak_30','login_streak_100','draw_streak_10','draw_streak_20'];
  -- 花費（隨機 0-2）
  spend_pool  TEXT[] := ARRAY['first_topup','topup_1000','topup_5000','topup_20000'];
  -- 社交（隨機 0-1）
  social_pool TEXT[] := ARRAY['refer_1','refer_5'];
  -- 幸運（隨機 0-2）
  lucky_pool  TEXT[] := ARRAY['lucky_first','lucky_day3','lucky_10'];
  -- 隱藏（隨機 0-1）
  hidden_pool TEXT[] := ARRAY['duplicate_10','single_day_100'];
  i INTEGER;
BEGIN
  FOR v_bot IN
    SELECT id, total_draws
    FROM public.users
    WHERE is_bot = true
  LOOP
    -- ── 1. 抽蛋徽章：依實際 total_draws 解鎖 ──────────────────
    FOR i IN 1..array_length(draw_badges, 1) LOOP
      IF v_bot.total_draws >= draw_thresh[i] THEN
        INSERT INTO public.user_badges (user_id, badge_id, earned_at)
        VALUES (v_bot.id, draw_badges[i], NOW() - (random() * interval '180 days'))
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;

    -- ── 2. 活躍徽章：random 抽 1-3 個 ────────────────────────────
    FOR i IN 1..array_length(active_pool, 1) LOOP
      IF random() < 0.45 THEN
        INSERT INTO public.user_badges (user_id, badge_id, earned_at)
        VALUES (v_bot.id, active_pool[i], NOW() - (random() * interval '120 days'))
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;

    -- ── 3. 花費徽章：random 抽 0-2 個 ──────────────────────────
    FOR i IN 1..array_length(spend_pool, 1) LOOP
      IF random() < 0.35 THEN
        INSERT INTO public.user_badges (user_id, badge_id, earned_at)
        VALUES (v_bot.id, spend_pool[i], NOW() - (random() * interval '150 days'))
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;

    -- ── 4. 社交徽章：random 抽 0-1 個 ──────────────────────────
    FOR i IN 1..array_length(social_pool, 1) LOOP
      IF random() < 0.25 THEN
        INSERT INTO public.user_badges (user_id, badge_id, earned_at)
        VALUES (v_bot.id, social_pool[i], NOW() - (random() * interval '90 days'))
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;

    -- ── 5. 幸運徽章：random 抽 0-2 個 ──────────────────────────
    FOR i IN 1..array_length(lucky_pool, 1) LOOP
      IF random() < 0.30 THEN
        INSERT INTO public.user_badges (user_id, badge_id, earned_at)
        VALUES (v_bot.id, lucky_pool[i], NOW() - (random() * interval '60 days'))
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;

    -- ── 6. 隱藏徽章：random 抽 0-1 個 ──────────────────────────
    FOR i IN 1..array_length(hidden_pool, 1) LOOP
      IF random() < 0.20 THEN
        INSERT INTO public.user_badges (user_id, badge_id, earned_at)
        VALUES (v_bot.id, hidden_pool[i], NOW() - (random() * interval '90 days'))
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;

    -- ── 7. 解鎖對應稱號（badge → title 關聯） ───────────────────
    INSERT INTO public.user_titles (user_id, title_id, earned_at, is_selected)
    SELECT
      v_bot.id,
      t.id,
      ub.earned_at,
      FALSE
    FROM public.user_badges ub
    JOIN public.titles t ON t.badge_id = ub.badge_id
    WHERE ub.user_id = v_bot.id
    ON CONFLICT DO NOTHING;

    -- ── 8. 隨機選一個稱號設為 is_selected ───────────────────────
    -- 先清所有 is_selected
    UPDATE public.user_titles SET is_selected = FALSE WHERE user_id = v_bot.id;
    -- 隨機選一個
    SELECT title_id INTO v_title
    FROM public.user_titles
    WHERE user_id = v_bot.id
    ORDER BY random()
    LIMIT 1;

    IF v_title IS NOT NULL THEN
      UPDATE public.user_titles
      SET is_selected = TRUE
      WHERE user_id = v_bot.id AND title_id = v_title;
    END IF;

  END LOOP;
END;
$$;
