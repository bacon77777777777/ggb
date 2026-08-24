-- 609: 帳號改成「驗證通過才建檔」（老闆 2026-08-24：現在只要填信箱送出就創建帳號了，會被攻擊）
--
-- 病根：`on_auth_user_created` 掛在 auth.users 的 AFTER INSERT。前台登入頁是
-- signInWithOtp（shouldCreateUser: true）—— **玩家一按「發送驗證碼」，auth.users 就先寫了一列**，
-- 於是 public.users 的遊戲檔（含邀請碼）在還沒輸入驗證碼前就開好了。
-- 任何人亂打信箱狂送，就會在站上堆出一堆空帳號（PROD 已經有 1 筆未驗證卻有檔的）。
--
-- 改法：觸發時機從「INSERT」改成「email 已驗證」——
--   · AFTER INSERT 且 email_confirmed_at 已有值 → LINE 快速登入（createUser email_confirm: true）
--     與後台建的帳號，行為不變
--   · AFTER UPDATE OF email_confirmed_at 且從 NULL 變成有值 → OTP 驗證通過的那一刻才建檔
-- 函數改成冪等（ON CONFLICT DO NOTHING）：前台 ensure-profile 也可能先建好，兩邊不會打架。
--
-- 未驗證的 auth.users 列仍會存在（那是 Supabase OTP 流程本身寫的，動不了），
-- 但它沒有遊戲檔、沒有邀請碼、不進任何統計與排行榜，等同不存在。
-- 另建議在 Supabase Auth 後台開啟 Turnstile／hCaptcha（免費）擋機器人狂發信，
-- 那是設定不是程式碼，這支 migration 不處理。

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 沒驗證過的信箱不建檔（見檔頭）
  IF NEW.email_confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.users (id, email, name, invite_code)
  VALUES (
    NEW.id,
    NEW.email,
    public.default_user_name(NULL, NEW.raw_user_meta_data->>'name'),
    public.generate_invite_code()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  WHEN (NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_confirmed
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.handle_new_user();
