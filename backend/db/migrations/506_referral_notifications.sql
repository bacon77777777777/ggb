-- 506: 邀請體系 2.0 的回饋與紀錄（老闆定的「寄信」概念）
--
-- 領取入口只有邀請頁一個；站內信（notifications，Navbar 鈴鐺）負責
-- 三件事：入帳回條（= 紀錄）、達標提醒（把邀請人拉回來按領取）。
-- 不做「信內領取」—— 兩個領取入口要同步狀態，信裡領取漏按率又高。
--
-- 1. 300 綁定禮入帳 → 寄回條給新戶
-- 2. 邀請進度達 5 的倍數 → 寄「可領取」信給邀請人（連去 /invite）
-- 3. 循環獎領取成功 → 寄領取回條（累積起來就是領取紀錄）

CREATE OR REPLACE FUNCTION public.apply_line_perks(p_user_id uuid, p_line_sub text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_new_line  boolean := false;
  v_bonus     int := 0;
  v_referrer  uuid;
  v_created   timestamptz;
  v_ref_count int;
  v_launch    CONSTANT timestamptz := '2026-08-08 00:00:00+08'; -- 新戶分界
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
      -- 入帳回條
      INSERT INTO notifications (user_id, type, title, body, link, meta)
      VALUES (p_user_id, 'reward', 'LINE 綁定禮已入帳',
              '感謝綁定 LINE，300 積分已加到你的帳上，到任務中心看看吧。',
              '/mission', jsonb_build_object('points', v_bonus));
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

      -- 進度剛好踩到 5 的倍數 → 提醒邀請人回來領（他不會自己知道）
      SELECT count(*) INTO v_ref_count
      FROM referrals WHERE referrer_id = v_referrer AND qualified_at IS NOT NULL;
      IF v_ref_count % 5 = 0 THEN
        INSERT INTO notifications (user_id, type, title, body, link, meta)
        VALUES (v_referrer, 'reward', '邀請獎勵可以領了',
                '你已成功邀請 ' || v_ref_count || ' 位好友，到邀請好友頁領取 100 積分吧。',
                '/invite', jsonb_build_object('qualified', v_ref_count));
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'new_line', v_new_line,
    'bonus', v_bonus, 'referrer', v_referrer
  );
END;
$$;
REVOKE ALL ON FUNCTION public.apply_line_perks(uuid, text) FROM PUBLIC, anon, authenticated;

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
    -- 領取回條 —— 累積起來就是領取紀錄
    INSERT INTO notifications (user_id, type, title, body, link, meta)
    VALUES (v_uid, 'reward', '邀請獎勵已入帳',
            '已領取 ' || v_total || ' 積分，到任務中心看看你的積分吧。',
            '/mission', jsonb_build_object('points', v_total));
  END IF;

  RETURN jsonb_build_object('success', true, 'claimed_points', v_total, 'qualified', v_qualified);
END;
$$;
