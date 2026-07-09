DO $$
DECLARE
  v_bot_ids  UUID[];
  v_bot_id   UUID;
  v_news_ids TEXT[];
  v_news_id  TEXT;
  v_texts    TEXT[] := ARRAY[
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
  v_n        INT;
  v_cnt      INT;
  v_offset   INT;
BEGIN
  -- 取最多 30 個 bot 帳號
  SELECT ARRAY(
    SELECT id FROM users WHERE is_bot = true ORDER BY RANDOM() LIMIT 30
  ) INTO v_bot_ids;

  IF array_length(v_bot_ids, 1) IS NULL OR array_length(v_bot_ids, 1) = 0 THEN
    RAISE NOTICE 'No bot users found, skipping seed';
    RETURN;
  END IF;

  -- 取最多 20 篇上架文章
  SELECT ARRAY(
    SELECT id::text FROM news WHERE is_active = true ORDER BY RANDOM() LIMIT 20
  ) INTO v_news_ids;

  IF array_length(v_news_ids, 1) IS NULL OR array_length(v_news_ids, 1) = 0 THEN
    RAISE NOTICE 'No active news found, skipping seed';
    RETURN;
  END IF;

  FOREACH v_news_id IN ARRAY v_news_ids
  LOOP
    -- 每篇文章 3~8 則留言
    v_cnt := 3 + FLOOR(RANDOM() * 6)::INT;
    FOR i IN 1..v_cnt
    LOOP
      v_offset := 1 + FLOOR(RANDOM() * array_length(v_bot_ids, 1))::INT;
      v_bot_id := v_bot_ids[v_offset];
      v_n      := 1 + FLOOR(RANDOM() * array_length(v_texts, 1))::INT;

      INSERT INTO news_comments (news_id, user_id, content, created_at)
      VALUES (
        v_news_id,
        v_bot_id,
        v_texts[v_n],
        NOW() - (RANDOM() * INTERVAL '14 days')
      );
    END LOOP;

    -- 隨機幾個 bot 按讚文章
    FOR i IN 1..( 2 + FLOOR(RANDOM() * 8)::INT )
    LOOP
      v_offset := 1 + FLOOR(RANDOM() * array_length(v_bot_ids, 1))::INT;
      v_bot_id := v_bot_ids[v_offset];
      INSERT INTO news_likes (news_id, user_id)
      VALUES (v_news_id, v_bot_id)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Bot comment seed done';
END $$;
