-- 501：auth 信箱變更同步到 public.users
--
-- 純 LINE 帳號在個人設定「前往綁定」補真信箱時，走的是 Supabase 的
-- email change 流程 —— 它只改 auth.users.email。public.users.email 是
-- 註冊當下由 handle_new_user 抄過來的快照，不跟著動的話，
-- 綁完信箱設定頁還是顯示舊的合成信箱，LINE 解綁的資格判斷也會看錯。

CREATE OR REPLACE FUNCTION public.handle_user_email_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE public.users SET email = NEW.email WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_changed ON auth.users;
CREATE TRIGGER on_auth_user_email_changed
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.handle_user_email_sync();
