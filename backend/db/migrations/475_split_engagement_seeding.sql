-- 475: 讚與留言分開種，並把變異做到位
--
-- ── 為什麼所有新文章都是 0 讚 ──
-- news-agent 寫完文章後連續做兩件事：
--
--   await generateAndSeedComments(...)                    ← AI 生成留言，只插 news_comments
--   void supabase.rpc('seed_bot_engagement_for_article')  ← 留言與讚都插
--
-- 而這支函數開頭是「已有留言就 return」。AI 那條先跑完，這支就直接返回 ——
-- 留言有、讚永遠是 0。實測 PROD：最後一筆機器人按讚停在 2026-08-04 18:01:34，
-- 之後六篇文章全部 0 讚，但留言都正常。
--
-- 改成兩件事各自判斷：留言看 news_comments、讚看 news_likes。
-- 這樣不管誰先跑、跑了哪一半，另一半都補得起來。
--
-- ── 順帶把變異做到位 ──
-- 老闆要的是「有時差距可以大一點，甚至沒人留言，或是甚至二、三、四十則留言，
-- 點贊十幾，甚至到破百 都有可能」。
--
-- 舊版讚與留言綁在同一個熱度檔次，所以永遠是「留言多的讚也多」。
-- 現在讓兩者各自擲骰：先擲文章熱度，再各自在熱度附近浮動，
-- 而且有 25% 機率其中一項跳檔 —— 這樣才會出現「留言四十則但讚只有十幾」
-- 或「沒人留言但讚破百」這種真實社群才有的組合。

CREATE OR REPLACE FUNCTION public.seed_bot_engagement_for_article(p_news_id TEXT)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_bot_ids UUID[];
  v_pool    INT;
  v_heat    NUMERIC;
  v_c_tier  INT;
  v_l_tier  INT;
  v_comments INT;
  v_likes    INT;
  v_existing INT;
  v_article_at TIMESTAMPTZ;
  i INT;

  v_texts TEXT[] := ARRAY[
    '🔥 這個必買！！', '終於來了😭 等好久了', '根本神 圖稿超美', '衝了衝了！！！',
    '哇靠這個超帥的吧', '看到這個整個人都不好了😍', '欸欸欸這個很猛吧🔥',
    '不行了荷包要哭了💀', '這個設計👍 根本必收', '期待台版上市🙏',
    '這系列一直很強', '朋友推我來看，果然沒讓人失望', '感覺品質應該不錯',
    '已截圖存下來了，要追這個', '這款真的有比上一波好看', '終於補貨了 等很久了',
    '設計很有特色，值得收', '定價有點小貴欸', '設計普普，不如上一波的好看',
    '先等評測再說，之前買過一次後悔', '為什麼台版都比日版貴那麼多',
    '品項感覺沒很特別，pass', '等等，這不是之前出過一次了嗎', '有夠扯 又再版',
    '台灣會出嗎？', '售價還沒公告嗎', '這個哪裡買得到', '有人知道幾月開始預購嗎',
    '跟上一波比起來哪個好', '幹這個帥到我', '這個根本是在針對我',
    '不行笑死，又來了', '????這個也太強了吧', '有夠扯 居然出這款',
    '等台版等到老了', '這個看起來比之前的版本強多了'
  ];

  -- 純 emoji 留言：真人本來就有一堆只丟表情的，好壞都有
  v_emoji TEXT[] := ARRAY[
    '❤️❤️❤️', '🔥🔥🔥', '😍😍', '🥹', '😭😭😭', '👍👍',
    '🙄🙄🙄🙄', '💀', '🤡', '😑', '🫠', '👀',
    '🤯', '😮‍💨', '🥰', '💸💸💸', '🙏🙏', '✨✨✨',
    '😂😂😂😂', '🫡', '❤️‍🔥', '😤'
  ];
BEGIN
  SELECT created_at INTO v_article_at FROM news WHERE id = p_news_id;
  IF v_article_at IS NULL THEN RETURN; END IF;

  SELECT ARRAY(SELECT id FROM users WHERE is_bot = true ORDER BY RANDOM()) INTO v_bot_ids;
  v_pool := COALESCE(array_length(v_bot_ids, 1), 0);
  IF v_pool = 0 THEN RETURN; END IF;

  -- 文章熱度：0 冷門 / 1 普通 / 2 熱門 / 3 爆紅
  v_heat := RANDOM();
  v_c_tier := CASE WHEN v_heat < 0.15 THEN 0 WHEN v_heat < 0.67 THEN 1 WHEN v_heat < 0.92 THEN 2 ELSE 3 END;
  v_l_tier := v_c_tier;

  -- 25% 機率讓其中一項跳檔。沒有這段的話，留言多的讚一定多，
  -- 永遠不會出現「留言四十則但讚只有十幾」或「沒人留言但讚破百」
  IF RANDOM() < 0.25 THEN
    IF RANDOM() < 0.5 THEN
      v_l_tier := LEAST(3, v_l_tier + 1 + FLOOR(RANDOM() * 2)::INT);
    ELSE
      v_l_tier := GREATEST(0, v_l_tier - 1 - FLOOR(RANDOM() * 2)::INT);
    END IF;
  END IF;

  v_comments := CASE v_c_tier
    WHEN 0 THEN FLOOR(RANDOM() * 3)::INT          -- 0~2，真的可以沒人留言
    WHEN 1 THEN 3  + FLOOR(RANDOM() * 13)::INT    -- 3~15
    WHEN 2 THEN 14 + FLOOR(RANDOM() * 19)::INT    -- 14~32
    ELSE        28 + FLOOR(RANDOM() * 23)::INT    -- 28~50
  END;

  v_likes := CASE v_l_tier
    WHEN 0 THEN 3   + FLOOR(RANDOM() * 20)::INT   -- 3~22
    WHEN 1 THEN 12  + FLOOR(RANDOM() * 49)::INT   -- 12~60
    WHEN 2 THEN 45  + FLOOR(RANDOM() * 76)::INT   -- 45~120
    ELSE        95  + FLOOR(RANDOM() * 106)::INT  -- 95~200，破百
  END;

  v_comments := LEAST(v_comments, v_pool);
  v_likes    := LEAST(v_likes,    v_pool);

  -- ── 留言：補到目標數，不是「有就跳過」──
  -- news-agent 會先用 AI 寫幾則有內容的留言（3~5 則），這裡把剩下的用罐頭與
  -- 純 emoji 補滿。這樣熱門文章才有機會出現二三十則，而 AI 的呼叫量不變 ——
  -- 「有就整個跳過」的話，每篇永遠停在 AI 那幾則，變異等於沒有。
  SELECT count(*) INTO v_existing FROM news_comments WHERE news_id = p_news_id;
  IF v_existing < v_comments THEN
    FOR i IN (v_existing + 1)..v_comments LOOP
      INSERT INTO news_comments (news_id, user_id, content, created_at)
      VALUES (
        p_news_id,
        v_bot_ids[i],
        CASE WHEN RANDOM() < 0.26
             THEN v_emoji[1 + FLOOR(RANDOM() * array_length(v_emoji, 1))::INT]
             ELSE v_texts[1 + FLOOR(RANDOM() * array_length(v_texts, 1))::INT]
        END,
        roll_comment_time(v_article_at)
      );
    END LOOP;
  END IF;

  -- ── 讚：自己判斷，不受留言有沒有種過影響 ──
  IF NOT EXISTS (SELECT 1 FROM news_likes WHERE news_id = p_news_id) THEN
    FOR i IN 1..v_likes LOOP
      INSERT INTO news_likes (news_id, user_id)
      VALUES (p_news_id, v_bot_ids[i])
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
END
$function$;

COMMENT ON FUNCTION public.seed_bot_engagement_for_article IS
  '文章的機器人互動。留言與讚各自判斷是否已種過，所以 news-agent 先跑 AI 留言也不影響按讚。讚與留言的熱度有 25% 機率脫鉤，避免每篇都「留言多讚也多」。';

-- ── 回補：那批 0 讚的文章 ──
DO $$
DECLARE r RECORD; n INT := 0;
BEGIN
  FOR r IN
    SELECT n2.id FROM news n2
    WHERE NOT EXISTS (SELECT 1 FROM news_likes l WHERE l.news_id = n2.id)
  LOOP
    PERFORM seed_bot_engagement_for_article(r.id);
    n := n + 1;
  END LOOP;
  RAISE NOTICE '回補 % 篇沒有讚的文章', n;
END $$;

SELECT left(title, 26) AS 標題,
       (SELECT count(*) FROM news_likes l WHERE l.news_id = n.id) AS 讚,
       (SELECT count(*) FROM news_comments c WHERE c.news_id = n.id) AS 留言
FROM news n WHERE n.is_active ORDER BY n.created_at DESC LIMIT 8;
