-- 新增 avatar_url 欄位到 users 表
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 更新 handle_new_user trigger：新用戶隨機分配頭像
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  avatar_index INT;
  avatar_path  TEXT;
BEGIN
  -- 從 01~08 隨機選一個頭像
  avatar_index := floor(random() * 8 + 1)::INT;
  avatar_path  := '/images/avatar/' || lpad(avatar_index::TEXT, 2, '0') || '.png';

  INSERT INTO public.users (id, email, name, avatar_url)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    avatar_path
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
