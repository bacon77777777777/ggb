-- v5 (updated)：大幅擴充模板（120+句）+ 同篇文章文字去重（v_used_texts 追蹤）
CREATE OR REPLACE FUNCTION seed_bot_engagement_for_article(p_news_id TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_bot_ids UUID[];
  v_bot_id  UUID;
  v_texts   TEXT[] := ARRAY[
    -- 單 emoji（多種）
    '🔥', '😍', '👍', '💀', '🙏', '😭', '👀', '🤩', '😮', '💯',
    '🫡', '🤯', '😤', '🥹', '❤️', '✨', '🫶',
    -- 超短詞（正面）
    '必買', '衝了', '太猛了', '好帥', '必收', '太強了',
    '喜歡', '讚', '帥到炸', '好想要', '猛', '神',
    '有夠帥', '太扯了', '根本神', '爆強',
    -- 超短詞（負面/中性）
    '普通', '貴', '有點貴', '沒感覺', 'pass', '再等等',
    '看看就好', '可有可無', '不如之前', '感覺還好',
    -- 正向短句（帶 emoji，多種說法）
    '🔥 這個必買！！',
    '必買清單+1 🔥',
    '哇靠這個超帥的吧',
    '欸欸欸很猛吧🔥',
    '終於來了😭',
    '等好久了😭',
    '衝了衝了！！！',
    '直接衝第一波',
    '不行了荷包要哭了💀',
    '荷包哭泣中💀',
    '????也太強了吧',
    '這個也太誇張了吧',
    '設計👍 根本必收',
    '這個設計真的猛👍',
    '期待台版上市🙏',
    '台版快出🙏',
    '看到這個整個人都不好了😍',
    '我的眼睛受到衝擊了😍',
    -- 正向短句（純文字，多種說法）
    '這系列一直很強',
    '這個系列從沒讓我失望',
    '設計很有特色，值得收',
    '這款質感看起來很不錯',
    '已截圖存下來了',
    '先截圖等發售',
    '朋友推我來看，沒讓人失望',
    '同事剛傳給我看，真的帥',
    '這款比上一波好看多了',
    '比之前的版本強',
    '幹這個帥到我',
    '這個根本是在針對我',
    '不行笑死，太合我胃口了',
    '這個看一眼就知道要買了',
    '終於補貨了 等很久了',
    '補貨消息！快衝',
    '這個感覺品質不錯',
    '做工看起來很精緻',
    -- 負向/懷疑（多種說法）
    '定價有點小貴欸',
    '價格有點難接受',
    '是不是貴了一點',
    '設計普普，pass',
    '感覺不如上一波',
    '這波不如之前的好看',
    '先等評測再說',
    '等有人開箱再考慮',
    '為什麼台版都比日版貴',
    '台版加價好誇張',
    '品項感覺沒很特別',
    '這次的品項普通了點',
    '等等這不是之前出過了嗎',
    '這個感覺之前見過',
    '有夠扯 又再版',
    '第幾次再版了',
    '看看就好，不一定要買',
    '這次猶豫中',
    -- 提問（多種說法）
    '台灣會出嗎？',
    '台版有消息嗎',
    '售價還沒公告嗎',
    '定價出了嗎',
    '哪裡買得到',
    '有在台灣賣嗎',
    '幾月開始預購',
    '預購什麼時候開',
    '跟上一波哪個好',
    '這跟之前那波比哪個值得',
    '有人知道發售日嗎',
    '發售日確定了嗎',
    -- 台灣網路語（多種）
    '等台版等到老了',
    '台版出了我就衝',
    '這個根本是我的菜',
    '這波我要全收',
    '沒想到會出這款',
    '朋友你快來看',
    '傳給我朋友了',
    '已加入追蹤',
    '這個先記著',
    '看到就知道要買'
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
