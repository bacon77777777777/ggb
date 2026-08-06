-- 478: 種留言時，時間不得早於文章發布時間
--
-- 477 回填了既有資料，但源頭沒改，下次種又會歪。
-- 原本是 `NOW() - RANDOM() * INTERVAL '36 hours'` —— 文章可能一小時前才發，
-- 留言卻被放到 30 小時前，前台就會看到「文章發布前就有人留言」。
--
-- 改成以文章發布時間為下界，在「發文到現在」這段區間內隨機，
-- 最多往前推 36 小時（老文章不要讓留言全部擠在剛發布的那幾分鐘）。

CREATE OR REPLACE FUNCTION public.roll_comment_time(p_article_at TIMESTAMPTZ)
RETURNS TIMESTAMPTZ
LANGUAGE sql
VOLATILE
AS $$
  SELECT GREATEST(p_article_at, now() - INTERVAL '36 hours')
       + random() * (now() - GREATEST(p_article_at, now() - INTERVAL '36 hours'));
$$;

COMMENT ON FUNCTION public.roll_comment_time IS
  '機器人留言的時間戳。下界是文章發布時間 —— 否則會出現「文章發布前就有人留言」。';
