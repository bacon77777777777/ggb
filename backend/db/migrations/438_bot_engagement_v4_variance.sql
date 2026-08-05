-- 438: 機器人互動數改為長尾分佈，並加入純 emoji 留言
--
-- v3 的問題是每篇都長得一樣：留言固定 4~10 則、讚固定 15~40 個，
-- 而且 bot 池只取 30 個，讚被去重後上限就卡在 30。
-- PROD 實際跑出來：留言 3~10（489 篇擠在 8 種數值）、讚 9~30、平均 19。
-- 一整排文章的數字都差不多，看起來就是機器產的。
--
-- 改成先擲一次「熱度」，再由熱度決定留言與讚的區間：
--
--   冷門 15%   留言 0~2     讚 3~18     ← 要真的會有 0 則留言的文章
--   普通 52%   留言 3~12    讚 12~55
--   熱門 25%   留言 12~28   讚 45~85
--   爆紅  8%   留言 25~45   讚 80~101
--
-- 讚的上限是機器人帳號總數（目前 101），因為 news_likes 有 (news_id, user_id)
-- 唯一鍵。要再往上只能加帳號，這裡就取到滿。
--
-- 另外讚與留言不是硬綁在一起：同一個熱度區間內各自再抖動，
-- 所以會出現「留言少但讚很多」或反過來的情形，那才像真的。

CREATE OR REPLACE FUNCTION seed_bot_engagement_for_article(p_news_id TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_bot_ids UUID[];
  v_pool    INT;
  v_heat    NUMERIC;
  v_comments INT;
  v_likes    INT;
  v_bot_id  UUID;

  -- 一般留言
  v_texts   TEXT[] := ARRAY[
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
    '這系列一直很強',
    '朋友推我來看，果然沒讓人失望',
    '感覺品質應該不錯',
    '已截圖存下來了，要追這個',
    '這款真的有比上一波好看',
    '終於補貨了 等很久了',
    '設計很有特色，值得收',
    '定價有點小貴欸',
    '設計普普，不如上一波的好看',
    '先等評測再說，之前買過一次後悔',
    '為什麼台版都比日版貴那麼多',
    '品項感覺沒很特別，pass',
    '等等，這不是之前出過一次了嗎',
    '有夠扯 又再版',
    '台灣會出嗎？',
    '售價還沒公告嗎',
    '這個哪裡買得到',
    '有人知道幾月開始預購嗎',
    '跟上一波比起來哪個好',
    '幹這個帥到我',
    '這個根本是在針對我',
    '不行笑死，又來了',
    '????這個也太強了吧',
    '有夠扯 居然出這款',
    '等台版等到老了',
    '這個看起來比之前的版本強多了'
  ];

  -- 純 emoji 留言：真人本來就有一堆只丟表情的，好壞都有
  v_emoji   TEXT[] := ARRAY[
    '❤️❤️❤️', '🔥🔥🔥', '😍😍', '🥹', '😭😭😭', '👍👍',
    '🙄🙄🙄🙄', '💀', '🤡', '😑', '🫠', '👀',
    '🤯', '😮‍💨', '🥰', '💸💸💸', '🙏🙏', '✨✨✨',
    '😂😂😂😂', '🫡', '❤️‍🔥', '😤'
  ];
BEGIN
  IF EXISTS (SELECT 1 FROM news_comments WHERE news_id = p_news_id) THEN
    RETURN;
  END IF;

  -- 全部機器人都進池：v3 只取 30 個，讚被去重後上限就卡死在 30
  SELECT ARRAY(SELECT id FROM users WHERE is_bot = true ORDER BY RANDOM())
  INTO v_bot_ids;

  v_pool := COALESCE(array_length(v_bot_ids, 1), 0);
  IF v_pool = 0 THEN RETURN; END IF;

  v_heat := RANDOM();

  IF v_heat < 0.15 THEN          -- 冷門：真的可以沒人留言
    v_comments := FLOOR(RANDOM() * 3)::INT;
    v_likes    := 3  + FLOOR(RANDOM() * 16)::INT;
  ELSIF v_heat < 0.67 THEN       -- 普通
    v_comments := 3  + FLOOR(RANDOM() * 10)::INT;
    v_likes    := 12 + FLOOR(RANDOM() * 44)::INT;
  ELSIF v_heat < 0.92 THEN       -- 熱門
    v_comments := 12 + FLOOR(RANDOM() * 17)::INT;
    v_likes    := 45 + FLOOR(RANDOM() * 41)::INT;
  ELSE                           -- 爆紅
    v_comments := 25 + FLOOR(RANDOM() * 21)::INT;
    v_likes    := 80 + FLOOR(RANDOM() * 22)::INT;
  END IF;

  v_comments := LEAST(v_comments, v_pool);
  v_likes    := LEAST(v_likes,    v_pool);

  -- 留言：一個 bot 一則，直接取打亂後的前 N 個
  FOR i IN 1..v_comments LOOP
    INSERT INTO news_comments (news_id, user_id, content, created_at)
    VALUES (
      p_news_id,
      v_bot_ids[i],
      -- 約四分之一是純 emoji
      CASE WHEN RANDOM() < 0.26
           THEN v_emoji[1 + FLOOR(RANDOM() * array_length(v_emoji, 1))::INT]
           ELSE v_texts[1 + FLOOR(RANDOM() * array_length(v_texts, 1))::INT]
      END,
      -- 時間拉長到 36 小時，不要全部擠在剛發文的那幾小時
      NOW() - (RANDOM() * INTERVAL '36 hours')
    );
  END LOOP;

  -- 讚：同樣取前 N 個，不重複所以不需要 ON CONFLICT 兜底
  FOR i IN 1..v_likes LOOP
    INSERT INTO news_likes (news_id, user_id)
    VALUES (p_news_id, v_bot_ids[i])
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

COMMENT ON FUNCTION seed_bot_engagement_for_article IS
  '為新文章種機器人互動。熱度長尾分佈，留言 0~45、讚 3~101，約 1/4 留言是純 emoji。';
