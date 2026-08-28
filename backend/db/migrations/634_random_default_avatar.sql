-- 634: 信箱驗證建帳號時隨機配一款預設頭像
--
-- 前台放了八款預設頭像（/images/avatar/01–08.webp），機器人帳號也確實平均分佈在
-- 這八款（每款 24–26 個）。但 `handle_new_user()` 從來沒有寫 avatar_url ——
-- 真人用信箱註冊的帳號 avatar_url 一直是 NULL，前台四處都 fallback 到 01.png，
-- 結果**所有信箱註冊的玩家頭像長得一模一樣**（PROD 目前 6 個真人帳號全是 NULL）。
--
-- LINE 註冊的走另一條路（app/api/auth/line/route.ts 建完帳號後寫 line.picture），
-- 那條不受影響：trigger 先配一款，LINE 流程再覆蓋成他自己的大頭貼。
--
-- 用 .webp 不用 .png：機器人與玩家自選存的都是 .webp，前台 `asset()` 兩種都吃。

CREATE OR REPLACE FUNCTION public.random_default_avatar()
RETURNS text
LANGUAGE sql
VOLATILE
AS $$
  SELECT '/images/avatar/' || lpad((floor(random() * 8) + 1)::int::text, 2, '0') || '.webp'
$$;

COMMENT ON FUNCTION public.random_default_avatar() IS
  '從八款預設頭像隨機挑一款，回傳前台可直接用的相對路徑';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 沒驗證過的信箱不建檔（見 migration 原始說明）
  IF NEW.email_confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.users (id, email, name, invite_code, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    public.default_user_name(NULL, NEW.raw_user_meta_data->>'name'),
    public.generate_invite_code(),
    public.random_default_avatar()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- 既有的 NULL 補上（每人各自隨機，不是全部同一款）
UPDATE public.users
   SET avatar_url = public.random_default_avatar()
 WHERE avatar_url IS NULL;
