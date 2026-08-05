-- 476: 留言的按讚數用疊加，不塞假的按讚紀錄
--
-- 老闆：「留言點讚也給一點假數據，看不到誰點，所以應該做疊加就好。」
--
-- 文章的讚是塞真資料列（news_likes），因為那張表沒有別的用途。
-- 但留言的讚不一樣：前台看不到「誰按的」，只顯示一個數字，
-- 所以塞 200 隻機器人的按讚紀錄除了佔空間沒有任何好處 ——
-- 而且真實玩家按讚時還要在裡面跟機器人擠。
--
-- 改成在 news_comments 上放一個底數，顯示時疊加：
--   顯示數 = bot_likes + 真實按讚數
-- 真實玩家的按讚照舊寫 news_comment_likes，取消也只會減掉自己那一個，
-- 不會把底數扣掉。

ALTER TABLE news_comments ADD COLUMN IF NOT EXISTS bot_likes INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN news_comments.bot_likes IS
  '展示用的按讚底數。前台顯示 bot_likes + 真實按讚數；前台看不到誰按讚，所以不需要塞假的按讚紀錄。';

-- 分布：多數留言 0~3 個讚，少數會被推爆。
-- 純 emoji 的留言通常拿不到什麼讚，酸民留言反而有時候很多人附和。
CREATE OR REPLACE FUNCTION public.roll_comment_bot_likes()
RETURNS INTEGER
LANGUAGE sql
VOLATILE
AS $$
  SELECT CASE
    WHEN random() < 0.45 THEN FLOOR(random() * 3)::INT        -- 45%：0~2，多數留言沒什麼人理
    WHEN random() < 0.85 THEN 3  + FLOOR(random() * 10)::INT  -- 40%：3~12
    WHEN random() < 0.97 THEN 13 + FLOOR(random() * 25)::INT  -- 12%：13~37
    ELSE                       38 + FLOOR(random() * 60)::INT --  3%：38~97，被推爆的那則
  END;
$$;

-- 既有留言補上
UPDATE news_comments SET bot_likes = roll_comment_bot_likes() WHERE bot_likes = 0;

-- 種留言時一併給
CREATE OR REPLACE FUNCTION public.set_comment_bot_likes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- 只給機器人的留言。真實玩家的留言從 0 開始，那才誠實
  IF NEW.bot_likes = 0 AND EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id AND is_bot) THEN
    NEW.bot_likes := roll_comment_bot_likes();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_comment_bot_likes ON news_comments;
CREATE TRIGGER trg_set_comment_bot_likes
  BEFORE INSERT ON news_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_comment_bot_likes();

SELECT '留言讚數分布' AS 項目,
       min(bot_likes) AS 最少, round(avg(bot_likes)) AS 平均,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY bot_likes)::INT AS 中位數,
       max(bot_likes) AS 最多,
       count(*) FILTER (WHERE bot_likes = 0) AS 零讚則數,
       count(*) AS 總則數
FROM news_comments;
