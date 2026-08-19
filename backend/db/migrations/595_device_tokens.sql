-- 595_device_tokens.sql
-- 推播裝置註冊表（FCM）
--
-- 兩個平台都走 Firebase Cloud Messaging：Android 原生就是 FCM，
-- iOS 由 Firebase 代發 APNs。後端因此只要一條發送路徑，
-- 不必同時實作 APNs 的 JWT + HTTP/2。

CREATE TABLE IF NOT EXISTS public.device_tokens (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token        text NOT NULL UNIQUE,
  platform     text NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  -- 裝置換人登入時要把 token 轉到新的 user，靠 UNIQUE(token) + upsert 處理
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  -- FCM 回報 UNREGISTERED（使用者刪 App／關通知）就標記，不實際刪列，
  -- 這樣看得出「曾經裝過但關掉了」跟「從來沒註冊過」的差別
  revoked_at   timestamptz,
  revoke_reason text
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user_active
  ON public.device_tokens (user_id) WHERE revoked_at IS NULL;

COMMENT ON TABLE public.device_tokens IS
  '推播裝置 token（FCM）。前台只透過 API route 以 service role 讀寫，不直接查。';

-- RLS：開啟但不建 policy —— 這張表沒有任何前台直查的情境，
-- 一律由 API route 用 service role 存取（service role 會繞過 RLS）。
-- ⚠️ 之後若要讓前台直接讀（例如「已登入裝置」清單），記得補 policy，
--    否則會靜默回空陣列。
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;


-- 帳號刪除時一併撤銷推播裝置：帳號都刪了還推播給那支手機就太怪了。
-- （users 是匿名化不是 DELETE，CASCADE 不會觸發，要自己處理）
CREATE OR REPLACE FUNCTION public.delete_user_account(
  p_user_id uuid,
  p_reason  text DEFAULT NULL,
  p_force   boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pre     json;
  v_tokens  bigint;
  v_tag     text;
BEGIN
  v_pre := account_deletion_preflight(p_user_id);

  IF (v_pre ->> 'error') IS NOT NULL THEN
    RETURN v_pre;
  END IF;
  IF (v_pre ->> 'already_deleted')::boolean THEN
    RETURN json_build_object('ok', false, 'error', 'already_deleted');
  END IF;
  IF (v_pre ->> 'pending_orders')::int > 0 THEN
    RETURN json_build_object('ok', false, 'error', 'pending_orders', 'detail', v_pre);
  END IF;
  IF (v_pre ->> 'warehouse_prizes')::int > 0 THEN
    RETURN json_build_object('ok', false, 'error', 'warehouse_prizes', 'detail', v_pre);
  END IF;
  IF NOT p_force AND (v_pre ->> 'tokens')::bigint > 0 THEN
    RETURN json_build_object('ok', false, 'error', 'tokens_remaining', 'detail', v_pre);
  END IF;

  v_tokens := (v_pre ->> 'tokens')::bigint;
  v_tag := 'deleted_' || replace(p_user_id::text, '-', '');

  IF v_tokens > 0 THEN
    INSERT INTO token_adjustments (user_id, delta, reason, created_by, category)
    VALUES (p_user_id, -v_tokens, '帳號刪除，餘額依服務條款視同放棄', 'system:account_deletion', 'other');
  END IF;

  UPDATE sell_listings
     SET status = 'removed'
   WHERE seller_id = p_user_id AND status IN ('pending', 'active');

  -- 撤銷推播裝置
  UPDATE device_tokens
     SET revoked_at = now(), revoke_reason = 'account_deleted'
   WHERE user_id = p_user_id AND revoked_at IS NULL;

  UPDATE users SET
      name              = '已刪除的帳號',
      email             = v_tag || '@deleted.invalid',
      phone             = NULL,
      phone_number      = NULL,
      is_phone_verified = false,
      address           = NULL,
      recipient_name    = NULL,
      recipient_phone   = NULL,
      avatar_url        = NULL,
      birthday          = NULL,
      gender            = NULL,
      line_user_id      = NULL,
      tokens            = 0,
      deleted_at        = now(),
      deleted_reason    = p_reason
    WHERE id = p_user_id;

  UPDATE auth.users SET
      email              = v_tag || '@deleted.invalid',
      phone              = NULL,
      encrypted_password = NULL,
      email_confirmed_at = NULL,
      phone_confirmed_at = NULL,
      email_change       = '',
      phone_change       = '',
      raw_user_meta_data = '{}'::jsonb,
      banned_until       = 'infinity'::timestamptz
    WHERE id = p_user_id;

  DELETE FROM auth.identities     WHERE user_id = p_user_id;
  DELETE FROM auth.refresh_tokens WHERE user_id = p_user_id::text;
  DELETE FROM auth.sessions       WHERE user_id = p_user_id;

  RETURN json_build_object('ok', true, 'tokens_forfeited', v_tokens);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_account(uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_account(uuid, text, boolean) TO service_role;
