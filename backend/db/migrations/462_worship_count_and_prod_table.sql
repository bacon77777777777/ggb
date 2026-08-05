-- 462: 資訊小卡加上「被膜拜次數」，並修好 PROD 缺表導致膜拜功能全壞
--
-- ── 先講壞掉的部分 ──
-- worship_player() 寫的是 worship_logs（migration 138 建的），
-- 但那支 migration 從來沒套到 PROD —— PROD 只有更早期的 user_worship_logs
-- （欄位也不同：user_id / created_at，沒有 worshipper_id / worship_date）。
--
-- 所以 PROD 的「膜拜大佬」按鈕一按就是 42P01（relation does not exist）。
-- 沒被發現是因為前台把錯誤吞掉，看起來只像沒有反應。
--
-- 這裡補建 worship_logs（沿用 138 的結構），舊表留著不動 —— 它是 0 筆，
-- 而且清單裡沒有它，貿然刪掉不如放著。

CREATE TABLE IF NOT EXISTS public.worship_logs (
  id            BIGSERIAL PRIMARY KEY,
  worshipper_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  worship_date  DATE NOT NULL DEFAULT CURRENT_DATE
);

-- 一人一天只能膜拜一次（對 worship_date 欄位建索引，不用函數索引，
-- 避免 immutable 的問題 —— 138 的註解已經踩過）
CREATE UNIQUE INDEX IF NOT EXISTS idx_worship_daily_limit
  ON public.worship_logs (worshipper_id, worship_date);
CREATE INDEX IF NOT EXISTS idx_worship_target ON public.worship_logs (target_id);

ALTER TABLE public.worship_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anyone can read worship logs" ON public.worship_logs;
CREATE POLICY "anyone can read worship logs" ON public.worship_logs FOR SELECT USING (true);

-- ── 資訊小卡回傳被膜拜次數 ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_player_profile(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user     RECORD;
  v_title    RECORD;
  v_badges   JSONB;
  v_worship  INTEGER;
BEGIN
  SELECT id, name, avatar_url, total_draws, total_spent
  INTO v_user FROM public.users WHERE id = p_user_id;

  IF v_user.id IS NULL THEN
    RETURN jsonb_build_object('error', 'user not found');
  END IF;

  SELECT t.id, t.name, t.color_key INTO v_title
  FROM public.user_titles ut
  JOIN public.titles t ON ut.title_id = t.id
  WHERE ut.user_id = p_user_id AND ut.is_selected = TRUE
  LIMIT 1;

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

  SELECT COUNT(*) INTO v_worship FROM public.worship_logs WHERE target_id = p_user_id;

  RETURN jsonb_build_object(
    'id',            v_user.id,
    'nickname',      COALESCE(v_user.name, '神秘玩家'),
    'avatar_url',    v_user.avatar_url,
    'total_draws',   v_user.total_draws,
    'total_spent',   v_user.total_spent,
    'worship_count', COALESCE(v_worship, 0),
    'title',         CASE WHEN v_title.id IS NOT NULL
                       THEN jsonb_build_object('id', v_title.id, 'name', v_title.name, 'color_key', v_title.color_key)
                       ELSE NULL END,
    'badges',        COALESCE(v_badges, '[]'::JSONB)
  );
END;
$function$;

COMMENT ON FUNCTION public.get_player_profile IS
  '玩家資訊小卡：暱稱、頭像、累計轉蛋、被膜拜次數、顯示中的稱號、徽章牆。';
