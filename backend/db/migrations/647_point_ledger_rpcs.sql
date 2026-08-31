-- 647_point_ledger_rpcs.sql
--
-- 積分的唯一進出口：apply_points_delta / grant_points / spend_points
--
-- 規則只有一條：**任何地方都不准再直接 `UPDATE users SET points = ...`**。
-- 只要還留著一條旁門，帳本就永遠對不起來，而且對不起來的時候查不出是誰做的。
--
-- 三支都是 SECURITY DEFINER：呼叫者（anon／authenticated）對 users 與
-- point_ledger 沒有寫入權限，改點一律經過這裡，順便保證帳本一定被寫。

BEGIN;

/*
 * 內部函數。加點與扣點是同一件事（delta 正負），寫成兩支只會有兩份要維護的鎖邏輯。
 *
 * 三個保證：
 *   ① 原子 —— 先 `SELECT ... FOR UPDATE` 鎖住玩家那一列，餘額檢查與寫入之間
 *      不會有人插隊。沒有它，兩個併發的扣點都讀到「夠」，結果扣成負的。
 *   ② 冪等 —— 帶了 p_idem 就先查有沒有做過；做過就原樣回傳當時的餘額，不重複扣。
 *      唯一索引是最後一道防線（併發下兩個交易可能都查不到，靠 unique 擋）。
 *   ③ 一致 —— users.points 與 point_ledger 在同一個交易裡改，不可能只成功一半。
 */
CREATE OR REPLACE FUNCTION public.apply_points_delta(
  p_user_id   uuid,
  p_delta     integer,
  p_type      text,
  p_reason    text     DEFAULT NULL,
  p_ref_table text     DEFAULT NULL,
  p_ref_id    text     DEFAULT NULL,
  p_idem      text     DEFAULT NULL,
  p_admin     text     DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance integer;
  v_new     integer;
  v_done    integer;
BEGIN
  IF p_delta = 0 THEN
    RAISE EXCEPTION '積分異動不可為 0';
  END IF;

  -- ② 冪等：這個動作做過就直接回當時的結果
  IF p_idem IS NOT NULL THEN
    SELECT balance_after INTO v_done FROM point_ledger WHERE idempotency_key = p_idem;
    IF FOUND THEN
      RETURN v_done;
    END IF;
  END IF;

  -- ① 鎖住玩家那一列再讀餘額
  SELECT COALESCE(points, 0) INTO v_balance FROM users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '玩家不存在: %', p_user_id;
  END IF;

  v_new := v_balance + p_delta;
  IF v_new < 0 THEN
    -- 訊息維持既有寫法，前台與抽獎引擎都在比對這四個字
    RAISE EXCEPTION '積分不足';
  END IF;

  UPDATE users SET points = v_new WHERE id = p_user_id;

  INSERT INTO point_ledger (user_id, delta, balance_after, type, reason, ref_table, ref_id, idempotency_key, created_by)
  VALUES (p_user_id, p_delta, v_new, p_type, p_reason, p_ref_table, p_ref_id, p_idem, p_admin);

  RETURN v_new;
EXCEPTION
  -- 併發下兩個交易可能都通過了上面的冪等查詢，唯一索引擋下後回傳既有結果
  WHEN unique_violation THEN
    SELECT balance_after INTO v_done FROM point_ledger WHERE idempotency_key = p_idem;
    IF FOUND THEN
      RETURN v_done;
    END IF;
    RAISE;
END;
$$;

/** 加點。p_amount 必須為正 */
CREATE OR REPLACE FUNCTION public.grant_points(
  p_user_id   uuid,
  p_amount    integer,
  p_type      text,
  p_reason    text DEFAULT NULL,
  p_ref_table text DEFAULT NULL,
  p_ref_id    text DEFAULT NULL,
  p_idem      text DEFAULT NULL,
  p_admin     text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'grant_points 的金額必須為正（收到 %）', p_amount;
  END IF;
  RETURN public.apply_points_delta(p_user_id, p_amount, p_type, p_reason, p_ref_table, p_ref_id, p_idem, p_admin);
END;
$$;

/** 扣點。p_amount 傳正數，函數內轉負 —— 呼叫端傳負數是最容易寫錯的地方 */
CREATE OR REPLACE FUNCTION public.spend_points(
  p_user_id   uuid,
  p_amount    integer,
  p_type      text,
  p_reason    text DEFAULT NULL,
  p_ref_table text DEFAULT NULL,
  p_ref_id    text DEFAULT NULL,
  p_idem      text DEFAULT NULL,
  p_admin     text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'spend_points 的金額必須為正（收到 %）', p_amount;
  END IF;
  RETURN public.apply_points_delta(p_user_id, -p_amount, p_type, p_reason, p_ref_table, p_ref_id, p_idem, p_admin);
END;
$$;

-- 只有 service_role（後台）與 DB 內部的其他函數會呼叫；前台不直接叫這幾支，
-- 一律經過各自的業務函數（daily_check_in、play_gacha…）
REVOKE ALL ON FUNCTION public.apply_points_delta(uuid,integer,text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_points(uuid,integer,text,text,text,text,text,text)       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.spend_points(uuid,integer,text,text,text,text,text,text)       FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_points_delta(uuid,integer,text,text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_points(uuid,integer,text,text,text,text,text,text)       TO service_role;
GRANT EXECUTE ON FUNCTION public.spend_points(uuid,integer,text,text,text,text,text,text)       TO service_role;

COMMIT;
