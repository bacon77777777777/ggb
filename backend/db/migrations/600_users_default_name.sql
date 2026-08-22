-- 600: users.name 不得為空 —— 預設名 + BEFORE INSERT 保險 + 回填
--
-- 老闆 2026-08-22：文章內頁留言、排行榜、首頁跑馬燈、玩家資料小卡都沒顯示暱稱。
-- 四個地方全讀 users.name，空的就退成「用戶／神秘玩家／神秘客」。
-- 會員頁看得到名字只是前台 AuthContext 用 email 前綴裝出來的暫時名（tempNameFrom）。
--
-- 為什麼會空：正常註冊走 auth.users 的 trigger handle_new_user，會填
-- metadata name 或 email 前綴。但清資料後 auth.users 還在、public.users 沒了，
-- 由前台 ensure-profile API 補建那列，它寫的是 name = metadata.name || null，
-- email 註冊沒有 metadata name → null。PROD 14 個真人只有老闆這一列中招。
--
-- 這裡在 DB 端補一道保險：任何路徑 INSERT users 時 name 空就自動補，
-- 規則跟 handle_new_user 一致（metadata name → email 前綴 → 'GGB 玩家'；
-- 撞名加四位數後綴）。LINE 快速帳號的合成信箱（@line-login.ggb.com.tw）
-- 前綴是 line_<id> 亂碼，不拿來當名字。

CREATE OR REPLACE FUNCTION public.default_user_name(p_email text, p_meta_name text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_base   text;
  v_name   text;
  v_suffix int;
  v_tries  int := 0;
BEGIN
  v_base := NULLIF(btrim(COALESCE(p_meta_name, '')), '');
  IF v_base IS NULL THEN
    IF p_email IS NOT NULL
       AND p_email NOT LIKE '%@line-login.ggb.com.tw'
       AND p_email NOT LIKE '%@line-login.ggb.internal'
       AND position('@' IN p_email) > 1 THEN
      v_base := split_part(p_email, '@', 1);
    ELSE
      v_base := 'GGB 玩家';
    END IF;
  END IF;

  v_name := v_base;
  WHILE EXISTS (SELECT 1 FROM public.users WHERE name = v_name) AND v_tries < 20 LOOP
    v_suffix := floor(random() * 9000 + 1000)::int;
    v_name := v_base || v_suffix;
    v_tries := v_tries + 1;
  END LOOP;
  RETURN v_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.users_default_name_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.name IS NULL OR btrim(NEW.name) = '' THEN
    NEW.name := public.default_user_name(NEW.email, NULL);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_default_name ON public.users;
CREATE TRIGGER trg_users_default_name
  BEFORE INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.users_default_name_trigger();

-- 回填：現有空名的帳號（PROD 只有老闆那一列；STG 0 列）
UPDATE public.users
SET name = public.default_user_name(email, NULL)
WHERE name IS NULL OR btrim(name) = '';
