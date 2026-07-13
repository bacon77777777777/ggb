-- 新聞互動數聚合 RPC
-- 解決 counts API 用 raw rows（受 1000 row 上限限制）導致讚數不準問題
-- 改用 GROUP BY 聚合，一次 call 取得所有文章的讚/留言數

CREATE OR REPLACE FUNCTION get_news_engagement_counts(news_ids text[])
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'likes', COALESCE((
      SELECT jsonb_object_agg(news_id::text, cnt)
      FROM (
        SELECT news_id::text, COUNT(*) AS cnt
        FROM news_likes
        WHERE news_id::text = ANY(news_ids)
        GROUP BY news_id::text
      ) l
    ), '{}'::jsonb),
    'comments', COALESCE((
      SELECT jsonb_object_agg(news_id::text, cnt)
      FROM (
        SELECT news_id::text, COUNT(*) AS cnt
        FROM news_comments
        WHERE news_id::text = ANY(news_ids)
        GROUP BY news_id::text
      ) c
    ), '{}'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION get_news_engagement_counts(text[]) TO anon, authenticated, service_role;
