-- 645：機器人帳號的暱稱與頭像換成「現行機制」的樣子
--
-- 排行榜上機器人的名字與頭像是直接讀 users 表（get_leaderboard_whales /
-- get_leaderboard_draws 都 JOIN users），而這批帳號是舊機制建的：
-- 頭像只用到 01~08（現在有 30 張，migration 641），暱稱有 73 個是兩個字的中文名。
-- 老闆 2026-08-30：「一堆頭像重複，暱稱都是兩個字看起來很假」。
--
-- 兩件事：
--   1. 頭像照 id 順序平均攤到 01~30 —— 用 random() 的話 201 個帳號還是會擠在同幾張
--   2. 兩個字的中文名與「訪客NNN」改用 default_user_name()（形容詞＋名詞詞庫，
--      跟真實新玩家同一套）。有梗的那些（吃土中／荷包已哭泣／開箱狂魔…）保留 ——
--      全部換成同一套產生器反而更整齊、更假
--
-- 這是資料更新，跑第二次會重新洗一輪名字，不需要重跑。

-- 1) 頭像平均攤到 30 張
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) - 1 AS rn
  FROM users
  WHERE is_bot = TRUE
)
UPDATE users u
SET avatar_url = '/images/avatar/' || lpad(((n.rn % 30) + 1)::text, 2, '0') || '.webp'
FROM numbered n
WHERE n.id = u.id;

-- 2) 兩個字的中文名／訪客NNN → 現行的暱稱產生器
--    一列一列跑：default_user_name() 是查 users 表確保不重複的，
--    整批 UPDATE 看不到同一條敘述裡剛寫進去的名字，會撞在一起
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM users
    WHERE is_bot = TRUE
      AND (name ~ '^[一-龥]{2}$' OR name ~ '^訪客[0-9]+$')
  LOOP
    UPDATE users SET name = public.default_user_name(NULL, NULL) WHERE id = r.id;
  END LOOP;
END $$;
