-- Migration 311: 邀請任務系統
-- 1. referrals 加 is_mission_credited（防止重設密碼時重複計入）
-- 2. complete_registration_referral：被邀請人完成設密碼後呼叫，計入邀請人任務

-- referrals 加防重複欄位
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS is_mission_credited BOOLEAN DEFAULT FALSE;

-- 函式：被邀請人完成設密碼（真正完成註冊）後，計入邀請人的任務進度
-- authenticated 可自行呼叫（本人完成註冊），service_role 後台亦可呼叫
CREATE OR REPLACE FUNCTION public.complete_registration_referral(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_referrer_id UUID;
BEGIN
  -- 防止代呼叫：authenticated 只能操作自己的 user_id
  IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'unauthorized');
  END IF;

  -- 找到尚未計入任務的推薦記錄，同時原子標記為已計入
  UPDATE public.referrals
  SET is_mission_credited = true
  WHERE referee_id = p_user_id AND is_mission_credited = false
  RETURNING referrer_id INTO v_referrer_id;

  IF v_referrer_id IS NULL THEN
    -- 無推薦記錄，或已計入過（重設密碼時不會重複）
    RETURN jsonb_build_object('success', false, 'message', 'no referral');
  END IF;

  -- 更新邀請人 total_referrals 計數
  UPDATE public.users
  SET total_referrals = COALESCE(total_referrals, 0) + 1
  WHERE id = v_referrer_id;

  -- 追蹤邀請人任務進度（週任務 + 成就）
  PERFORM public.track_mission_event_for_user(v_referrer_id, 'invite_friend', '{}');

  RETURN jsonb_build_object('success', true, 'referrer_id', v_referrer_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_registration_referral(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.complete_registration_referral(UUID) TO authenticated, service_role;
