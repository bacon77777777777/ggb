-- 505: 邀請體系 2.0（老闆 2026-08-08 拍板）
--
-- 規則：
-- - 好友「綁定 LINE」那一刻才算有效邀請（LINE 註冊自帶手機驗證，
--   免費幫平台做完真人驗證；不用開簡訊商）
-- - 新戶（功能上線後註冊）首次綁 LINE 送 300 積分，有沒有被邀請都送
-- - 邀請人每 5 位有效邀請領 100 積分，無上限循環，手動領取
-- - 一顆 LINE 一生只能觸發一次（綁定禮＋邀請計入共用 line_grant_ledger
--   主鍵兜底）：解綁重綁、換帳號、奪綁（空殼收回）都刷不出第二次
-- - 週任務改造：邀 1 位/100 積分；日任務新增：分享邀請/10 積分

-- 1) LINE 帳本 —— service_role 專用，前台不直讀，不開 policy
CREATE TABLE IF NOT EXISTS public.line_grant_ledger (
  line_sub      text PRIMARY KEY,
  user_id       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  bonus_points  int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.line_grant_ledger ENABLE ROW LEVEL SECURITY;

-- 2) referrals 生效欄位：qualified_at IS NOT NULL 才算有效邀請
--   （舊資料為 0 筆，無祖父條款負擔）
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS qualified_at timestamptz;
UPDATE public.referrals SET qualified_at = now() WHERE qualified_at IS NULL;

-- 3) 循環獎領取表
CREATE TABLE IF NOT EXISTS public.referral_cycle_claims (
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  milestone   int NOT NULL,          -- 5, 10, 15, ...
  points      int NOT NULL,
  claimed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, milestone)
);
ALTER TABLE public.referral_cycle_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own cycle claims readable" ON public.referral_cycle_claims;
CREATE POLICY "own cycle claims readable" ON public.referral_cycle_claims
  FOR SELECT USING (auth.uid() = user_id);

-- 4) 發放函數 —— LINE 建號／登入／綁定／填碼四條路共用，冪等
CREATE OR REPLACE FUNCTION public.apply_line_perks(p_user_id uuid, p_line_sub text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_new_line boolean := false;
  v_bonus    int := 0;
  v_referrer uuid;
  v_created  timestamptz;
  v_launch   CONSTANT timestamptz := '2026-08-08 00:00:00+08'; -- 新戶分界
BEGIN
  IF p_user_id IS NULL OR p_line_sub IS NULL OR p_line_sub = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'bad args');
  END IF;

  -- 一顆 LINE 一生一次：搶到 insert 的帳號才有後續
  INSERT INTO line_grant_ledger (line_sub, user_id)
  VALUES (p_line_sub, p_user_id)
  ON CONFLICT (line_sub) DO NOTHING;
  v_new_line := FOUND;

  IF v_new_line THEN
    SELECT created_at INTO v_created FROM users WHERE id = p_user_id;
    IF v_created >= v_launch THEN
      v_bonus := 300;
      UPDATE users SET points = COALESCE(points, 0) + v_bonus WHERE id = p_user_id;
      UPDATE line_grant_ledger SET bonus_points = v_bonus WHERE line_sub = p_line_sub;
    END IF;
  END IF;

  -- 邀請計入：這顆 LINE 必須是被「這個帳號」首次消耗的，且有未生效邀請。
  -- 空殼奪綁後再填碼 → 帳本掛在空殼名下 → 不成立，刷不動
  IF EXISTS (SELECT 1 FROM line_grant_ledger
             WHERE line_sub = p_line_sub AND user_id = p_user_id) THEN
    UPDATE referrals SET qualified_at = now()
    WHERE referee_id = p_user_id AND qualified_at IS NULL
    RETURNING referrer_id INTO v_referrer;

    IF v_referrer IS NOT NULL THEN
      UPDATE users SET total_referrals = COALESCE(total_referrals, 0) + 1
      WHERE id = v_referrer;
      -- 驅動週任務（invite_friend weekly）與四階成就（ALL）
      PERFORM track_mission_event_for_user(v_referrer, 'invite_friend', '{}');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'new_line', v_new_line,
    'bonus', v_bonus, 'referrer', v_referrer
  );
END;
$$;
REVOKE ALL ON FUNCTION public.apply_line_perks(uuid, text) FROM PUBLIC, anon, authenticated;

-- 5) 循環獎領取（authenticated 本人呼叫）
CREATE OR REPLACE FUNCTION public.claim_referral_cycle_reward()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_step      CONSTANT int := 5;
  v_per       CONSTANT int := 100;
  v_qualified int;
  v_available int;
  v_m         int;
  v_total     int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT count(*) INTO v_qualified
  FROM referrals WHERE referrer_id = v_uid AND qualified_at IS NOT NULL;

  v_available := v_qualified / v_step;
  FOR v_m IN 1..v_available LOOP
    BEGIN
      INSERT INTO referral_cycle_claims (user_id, milestone, points)
      VALUES (v_uid, v_m * v_step, v_per);
      v_total := v_total + v_per;
    EXCEPTION WHEN unique_violation THEN
      NULL; -- 這一階領過了
    END;
  END LOOP;

  IF v_total > 0 THEN
    UPDATE users SET points = COALESCE(points, 0) + v_total WHERE id = v_uid;
  END IF;

  RETURN jsonb_build_object('success', true, 'claimed_points', v_total, 'qualified', v_qualified);
END;
$$;

-- 6) 任務：週任務改造（原停用的「邀請5位好友/1000」→ 1 位/100 啟用）
UPDATE public.tasks
SET title = '邀請 1 位好友',
    description = '本週成功邀請 1 位好友加入',
    target_value = 1,
    reward_coins = 100,
    is_active = true
WHERE type = 'weekly' AND condition_type = 'invite_friend';

--    日任務：分享邀請（自己能完成的動作才進日清單）
INSERT INTO public.tasks (type, title, description, target_value, reward_coins, condition_type, icon_name, sort_order)
SELECT 'daily', '分享邀請給好友', '到「邀請好友」頁按下分享或下載', 1, 10, 'share_invite', 'Share', 150
WHERE NOT EXISTS (SELECT 1 FROM public.tasks WHERE condition_type = 'share_invite');
