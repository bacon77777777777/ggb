-- 建立可重複呼叫的 bot 留言/讚種子函數
-- 只對「尚無留言」的文章補種，避免重複
CREATE OR REPLACE FUNCTION seed_bot_engagement_for_article(p_news_id TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_bot_ids UUID[];
  v_bot_id  UUID;
  v_texts   TEXT[] := ARRAY[
    '太期待了！這個系列真的太強',
    '好想抽到這個啊',
    '聯名設計超棒的',
    '這個一定要收！',
    '出了我一定衝第一波',
    '超好看！已經在等了',
    '這個款式真的很有質感',
    '買了買了！不買會後悔',
    '這系列一直很強，穩穩支持',
    '期待台版快點出',
    '設計很有特色耶',
    '這個也太厲害了吧',
    '已加入追蹤清單了',
    '這個款式真的太帥了',
    '跟朋友一起衝！',
    '感覺品質很不錯',
    '這個價格可以接受',
    '每次出新款都這麼強',
    '已截圖存下來了',
    '抽到大獎的話太賺了'
  ];
  v_cnt    INT;
  v_offset INT;
BEGIN
  -- 已有留言就跳過
  IF EXISTS (SELECT 1 FROM news_comments WHERE news_id = p_news_id) THEN
    RETURN;
  END IF;

  SELECT ARRAY(
    SELECT id FROM users WHERE is_bot = true ORDER BY RANDOM() LIMIT 20
  ) INTO v_bot_ids;

  IF array_length(v_bot_ids, 1) IS NULL THEN RETURN; END IF;

  -- 留言 2~5 則
  v_cnt := 2 + FLOOR(RANDOM() * 4)::INT;
  FOR i IN 1..v_cnt LOOP
    v_offset := 1 + FLOOR(RANDOM() * array_length(v_bot_ids, 1))::INT;
    v_bot_id := v_bot_ids[v_offset];
    INSERT INTO news_comments (news_id, user_id, content, created_at)
    VALUES (
      p_news_id, v_bot_id,
      v_texts[1 + FLOOR(RANDOM() * array_length(v_texts, 1))::INT],
      NOW() - (RANDOM() * INTERVAL '3 hours')
    );
  END LOOP;

  -- 按讚 3~12 個 bot
  FOR i IN 1..(3 + FLOOR(RANDOM() * 10)::INT) LOOP
    v_offset := 1 + FLOOR(RANDOM() * array_length(v_bot_ids, 1))::INT;
    v_bot_id := v_bot_ids[v_offset];
    INSERT INTO news_likes (news_id, user_id)
    VALUES (p_news_id, v_bot_id)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- 補種目前所有上架但無留言的文章
DO $$
DECLARE v_id TEXT;
BEGIN
  FOR v_id IN
    SELECT id::text FROM news
    WHERE is_active = true
    AND NOT EXISTS (SELECT 1 FROM news_comments WHERE news_id = id::text)
  LOOP
    PERFORM seed_bot_engagement_for_article(v_id);
  END LOOP;
END $$;
