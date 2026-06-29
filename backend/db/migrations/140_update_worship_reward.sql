-- 修改膜拜 RPC (Worship Player)
-- 將獎勵從 1 代幣改為 10 積分

CREATE OR REPLACE FUNCTION worship_player(p_target_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_today DATE := CURRENT_DATE;
  v_already_worshipped BOOLEAN;
BEGIN
  -- 取得當前用戶
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', '請先登入');
  END IF;

  -- 不能膜拜自己
  IF v_user_id = p_target_id THEN
    RETURN jsonb_build_object('success', false, 'message', '不能膜拜自己');
  END IF;

  -- 檢查今日是否已膜拜 (利用 worship_date 查詢)
  SELECT EXISTS (
    SELECT 1 FROM worship_logs 
    WHERE worshipper_id = v_user_id 
    AND worship_date = v_today
  ) INTO v_already_worshipped;

  IF v_already_worshipped THEN
    RETURN jsonb_build_object('success', false, 'message', '今天已經膜拜過大佬了，明天再來吧！');
  END IF;

  -- 寫入紀錄 (明確寫入 worship_date)
  INSERT INTO worship_logs (worshipper_id, target_id, worship_date)
  VALUES (v_user_id, p_target_id, v_today);

  -- 給予獎勵 (10 積分)
  UPDATE users
  SET points = points + 10
  WHERE id = v_user_id;

  RETURN jsonb_build_object('success', true, 'message', '膜拜成功！獲得 10 積分');
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'message', '今天已經膜拜過了');
WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;
