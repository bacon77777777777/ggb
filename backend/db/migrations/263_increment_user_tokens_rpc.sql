-- W8-0: 安全遞增用戶代幣的 RPC（避免 race condition）
CREATE OR REPLACE FUNCTION increment_user_tokens(p_user_id uuid, p_amount numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE users
  SET tokens = tokens + p_amount
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到用戶 %', p_user_id;
  END IF;
END;
$$;
