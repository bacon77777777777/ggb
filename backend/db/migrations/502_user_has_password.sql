-- 502：查帳號有沒有設過密碼
--
-- 設定頁的「登入密碼」列要分三態：沒設過 →「立即設定」、設過 →「修改」。
-- 「有沒有密碼」只存在 auth.users.encrypted_password，PostgREST 不暴露
-- auth schema，所以包一個函數給 service role 呼叫。
--
-- 只給 service role：這個資訊等於告訴攻擊者「這個帳號能不能用密碼打」，
-- 不能讓前端直接問。

CREATE OR REPLACE FUNCTION public.user_has_password(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = p_user_id
      AND encrypted_password IS NOT NULL
      AND encrypted_password <> ''
  );
$$;

REVOKE ALL ON FUNCTION public.user_has_password(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_password(uuid) TO service_role;
