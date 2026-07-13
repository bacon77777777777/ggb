-- seed_bot_engagement_for_article 改為只種讚，移除 hardcoded 留言
-- 留言改由 news-agent 呼叫 Claude Haiku AI 生成（contextual + 時間分布）

CREATE OR REPLACE FUNCTION seed_bot_engagement_for_article(p_news_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bot_ids UUID[];
  v_bot_id  UUID;
BEGIN
  -- 按讚：15~40 個 bot 按讚（維持原本邏輯）
  SELECT ARRAY(
    SELECT id FROM users WHERE is_bot = true ORDER BY RANDOM() LIMIT 40
  ) INTO v_bot_ids;

  IF array_length(v_bot_ids, 1) IS NULL THEN RETURN; END IF;

  FOR i IN 1..(15 + FLOOR(RANDOM() * 26)::INT) LOOP
    v_bot_id := v_bot_ids[1 + FLOOR(RANDOM() * array_length(v_bot_ids, 1))::INT];
    INSERT INTO news_likes (news_id, user_id)
    VALUES (p_news_id, v_bot_id)
    ON CONFLICT DO NOTHING;
  END LOOP;
END
$$;
