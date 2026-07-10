-- v4：留言長度多樣化，從單 emoji 到短句都有
CREATE OR REPLACE FUNCTION seed_bot_engagement_for_article(p_news_id TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_bot_ids UUID[];
  v_bot_id  UUID;
  v_texts   TEXT[] := ARRAY[
    -- 單 emoji
    '🔥',
    '😍',
    '👍',
    '💀',
    '🙏',
    '😭',
    '👀',
    '🤩',
    -- 超短（2~4 字）
    '必買',
    '衝了',
    '太猛了',
    '好帥',
    '必收',
    '太強了',
    '傳說等級',
    '有夠扯',
    '喜歡',
    -- 短句（帶 emoji）
    '🔥 這個必買！！',
    '終於來了😭',
    '衝了衝了！！！',
    '哇靠這個超帥的吧',
    '不行了荷包要哭了💀',
    '欸欸欸很猛吧🔥',
    '????也太強了吧',
    -- 短句（純文字）
    '這系列一直很強',
    '等很久了終於來了',
    '設計很有特色',
    '已截圖存下來了',
    '朋友推我來看，沒讓人失望',
    '這款比上一波好看',
    '幹這個帥到我',
    '這個根本是在針對我',
    '不行笑死',
    '等台版等到老了',
    -- 負向/懷疑
    '定價有點小貴欸',
    '設計普普，pass',
    '先等評測再說',
    '為什麼台版都比日版貴',
    '等等這不是之前出過了嗎',
    '品項感覺沒很特別',
    -- 提問
    '台灣會出嗎？',
    '幾月開始預購',
    '哪裡買得到',
    '跟上一波哪個好'
  ];
  v_cnt    INT;
BEGIN
  IF EXISTS (SELECT 1 FROM news_comments WHERE news_id = p_news_id) THEN
    RETURN;
  END IF;

  SELECT ARRAY(
    SELECT id FROM users WHERE is_bot = true ORDER BY RANDOM() LIMIT 30
  ) INTO v_bot_ids;

  IF array_length(v_bot_ids, 1) IS NULL THEN RETURN; END IF;

  v_cnt := LEAST(4 + FLOOR(RANDOM() * 7)::INT, array_length(v_bot_ids, 1));
  FOR i IN 1..v_cnt LOOP
    v_bot_id := v_bot_ids[i];
    INSERT INTO news_comments (news_id, user_id, content, created_at)
    VALUES (
      p_news_id, v_bot_id,
      v_texts[1 + FLOOR(RANDOM() * array_length(v_texts, 1))::INT],
      NOW() - (RANDOM() * INTERVAL '4 hours')
    );
  END LOOP;

  FOR i IN 1..(15 + FLOOR(RANDOM() * 26)::INT) LOOP
    v_bot_id := v_bot_ids[1 + FLOOR(RANDOM() * array_length(v_bot_ids, 1))::INT];
    INSERT INTO news_likes (news_id, user_id)
    VALUES (p_news_id, v_bot_id)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;
