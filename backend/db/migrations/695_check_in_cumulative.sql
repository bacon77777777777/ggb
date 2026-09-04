-- 695_check_in_cumulative.sql
--
-- 簽到改成「累計」不是「連續」：漏簽不歸零，隔天回來接著算（老闆 2026-09-04：比較友善）
--
-- 原本往回一天一天數「昨天有沒有簽」，漏一天就從第 1 格重算。
-- 現在看的是這個人總共簽了幾次：第 7、14、21… 次拿 100，其餘 20。
-- 今天簽、明天沒簽、後天簽 → 後天是第 2 格。
-- 既有資料不用回填：總次數本來就在表裡，有 5 筆的人下一次是第 6 格。
--
-- 回傳欄位：total_days（累計簽到天數，含今天若已簽）、checked_in_today、next_reward。
-- consecutive_days 暫時留著＝total_days：線上前台（推版前）讀的是它，拿掉會讓抬頭變空。推版後可移除。

BEGIN;

-- ───────────────── daily_check_in ─────────────────
CREATE OR REPLACE FUNCTION public.daily_check_in(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  -- 台灣日期（migration 694）。DB 時區是 UTC，CURRENT_DATE 在台灣早上 8 點才換日
  v_today  DATE    := (NOW() AT TIME ZONE 'Asia/Taipei')::date;
  v_total  INTEGER;
  v_reward INTEGER;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.daily_check_ins
    WHERE user_id = p_user_id AND check_in_date = v_today
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', '今日已簽到');
  END IF;

  -- 累計簽到次數，不管中間有沒有漏（migration 695）
  SELECT count(*) INTO v_total FROM public.daily_check_ins WHERE user_id = p_user_id;

  -- 第 7、14、21… 次（簽到前 total % 7 = 6）給 100，其餘 20
  v_reward := CASE WHEN v_total % 7 = 6 THEN 100 ELSE 20 END;

  INSERT INTO public.daily_check_ins (user_id, check_in_date, reward_amount)
  VALUES (p_user_id, v_today, v_reward);

  -- 積分一律走帳本（migration 647）。冪等鍵＝一人一天一次，
  -- 就算前台重送也只會入帳一次
  PERFORM public.grant_points(
    p_user_id, v_reward, 'check_in', '每日簽到',
    'daily_check_ins', p_user_id::text || ':' || v_today::text,
    'check_in:' || p_user_id::text || ':' || v_today::text);

  RETURN jsonb_build_object(
    'success',          true,
    'message',          '簽到成功',
    'reward',           v_reward,
    'total_days',       v_total + 1,
    'consecutive_days', v_total + 1
  );
END;
$function$;

-- ───────────────── get_check_in_status ─────────────────
CREATE OR REPLACE FUNCTION public.get_check_in_status(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_today         DATE := (NOW() AT TIME ZONE 'Asia/Taipei')::date;
  v_total         INTEGER;
  v_checked_today BOOLEAN;
  v_next_reward   INTEGER;
BEGIN
  SELECT count(*), COALESCE(bool_or(check_in_date = v_today), false)
    INTO v_total, v_checked_today
  FROM public.daily_check_ins
  WHERE user_id = p_user_id;

  -- 下一次簽到拿多少（今天還沒簽 = 今天這次；已簽 = 明天那次）。與 daily_check_in 同一條規則
  v_next_reward := CASE WHEN v_total % 7 = 6 THEN 100 ELSE 20 END;

  RETURN jsonb_build_object(
    'total_days',        v_total,
    'checked_in_today',  v_checked_today,
    'next_reward',       v_next_reward,
    'consecutive_days',  v_total
  );
END;
$function$;

COMMIT;
