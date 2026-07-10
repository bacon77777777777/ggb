-- v3：每個 bot 每篇文章最多留一則留言（不重複出現）
CREATE OR REPLACE FUNCTION seed_bot_engagement_for_article(p_news_id TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_bot_ids UUID[];
  v_bot_id  UUID;
  v_texts   TEXT[] := ARRAY[
    -- 正向（有 emoji）
    '🔥 這個必買！！',
    '終於來了😭 等好久了',
    '根本神 圖稿超美',
    '衝了衝了！！！',
    '哇靠這個超帥的吧',
    '看到這個整個人都不好了😍',
    '欸欸欸這個很猛吧🔥',
    '不行了荷包要哭了💀',
    '這個設計👍 根本必收',
    '期待台版上市🙏',
    -- 正向（純文字）
    '這系列一直很強',
    '朋友推我來看，果然沒讓人失望',
    '感覺品質應該不錯',
    '已截圖存下來了，要追這個',
    '這款真的有比上一波好看',
    '終於補貨了 等很久了',
    '設計很有特色，值得收',
    -- 負向/懷疑
    '定價有點小貴欸',
    '設計普普，不如上一波的好看',
    '先等評測再說，之前買過一次後悔',
    '為什麼台版都比日版貴那麼多',
    '品項感覺沒很特別，pass',
    '等等，這不是之前出過一次了嗎',
    '有夠扯 又再版',
    -- 好奇/提問
    '台灣會出嗎？',
    '售價還沒公告嗎',
    '這個哪裡買得到',
    '有人知道幾月開始預購嗎',
    '跟上一波比起來哪個好',
    -- 台灣網路用語
    '幹這個帥到我',
    '這個根本是在針對我',
    '不行笑死，又來了',
    '????這個也太強了吧',
    '有夠扯 居然出這款',
    '等台版等到老了',
    '這個看起來比之前的版本強多了'
  ];
  v_cnt    INT;
BEGIN
  IF EXISTS (SELECT 1 FROM news_comments WHERE news_id = p_news_id) THEN
    RETURN;
  END IF;

  -- 取 30 個不重複 bot，ORDER BY RANDOM() 已打亂順序
  SELECT ARRAY(
    SELECT id FROM users WHERE is_bot = true ORDER BY RANDOM() LIMIT 30
  ) INTO v_bot_ids;

  IF array_length(v_bot_ids, 1) IS NULL THEN RETURN; END IF;

  -- 留言 4~10 則，直接取陣列前 N 個 → 每個 bot 最多一則
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

  -- 按讚 15~40 個 bot（讚可以重複嘗試，ON CONFLICT 去重）
  FOR i IN 1..(15 + FLOOR(RANDOM() * 26)::INT) LOOP
    v_bot_id := v_bot_ids[1 + FLOOR(RANDOM() * array_length(v_bot_ids, 1))::INT];
    INSERT INTO news_likes (news_id, user_id)
    VALUES (p_news_id, v_bot_id)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;
