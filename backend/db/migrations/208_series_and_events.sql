-- 1. Add series field to products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS series TEXT;

-- 2. User behavioral event tracking
CREATE TABLE IF NOT EXISTS public.user_events (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id   TEXT,
  event_type   TEXT NOT NULL CHECK (event_type IN ('product_view','product_click','search','draw','series_click')),
  product_id   INT  REFERENCES public.products(id) ON DELETE SET NULL,
  series       TEXT,
  meta         JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ue_user_type   ON public.user_events (user_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ue_product     ON public.user_events (product_id, event_type);
CREATE INDEX IF NOT EXISTS idx_ue_user_series ON public.user_events (user_id, series, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ue_session     ON public.user_events (session_id, created_at DESC);

ALTER TABLE public.user_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can insert events"   ON public.user_events;
DROP POLICY IF EXISTS "Users can read own events"  ON public.user_events;

CREATE POLICY "Anyone can insert events"  ON public.user_events FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can read own events" ON public.user_events FOR SELECT USING (user_id = auth.uid());

-- 3. Series keyword → canonical Chinese name mapping
CREATE TABLE IF NOT EXISTS public.series_keywords (
  id          SERIAL PRIMARY KEY,
  keyword     TEXT NOT NULL,
  series_name TEXT NOT NULL,
  UNIQUE (keyword)
);

INSERT INTO public.series_keywords (keyword, series_name) VALUES
  ('寶可夢','寶可夢'),('pokemon','寶可夢'),('pokémon','寶可夢'),('精靈寶可夢','寶可夢'),('皮卡丘','寶可夢'),('伊布','寶可夢'),('噴火龍','寶可夢'),
  ('蛋黃哥','蛋黃哥'),('gudetama','蛋黃哥'),
  ('三麗鷗','三麗鷗'),('sanrio','三麗鷗'),
  ('hello kitty','Hello Kitty'),('hellokitty','Hello Kitty'),('凱蒂貓','Hello Kitty'),
  ('美樂蒂','美樂蒂'),('my melody','美樂蒂'),('マイメロディ','美樂蒂'),
  ('玉桂狗','玉桂狗'),('cinnamoroll','玉桂狗'),('シナモロール','玉桂狗'),
  ('布丁狗','布丁狗'),('pompompurin','布丁狗'),('ポムポムプリン','布丁狗'),
  ('大耳狗','大耳狗'),
  ('鬼滅之刃','鬼滅之刃'),('鬼滅','鬼滅之刃'),('demon slayer','鬼滅之刃'),('鬼滅の刃','鬼滅之刃'),
  ('航海王','航海王'),('one piece','航海王'),('海賊王','航海王'),('ワンピース','航海王'),
  ('七龍珠','七龍珠'),('dragon ball','七龍珠'),('ドラゴンボール','七龍珠'),('龍珠','七龍珠'),
  ('火影忍者','火影忍者'),('naruto','火影忍者'),('ナルト','火影忍者'),
  ('咒術迴戰','咒術迴戰'),('咒術','咒術迴戰'),('jujutsu kaisen','咒術迴戰'),('呪術廻戦','咒術迴戰'),
  ('進擊的巨人','進擊的巨人'),('進擊','進擊的巨人'),('attack on titan','進擊的巨人'),('進撃の巨人','進擊的巨人'),
  ('排球少年','排球少年'),('haikyuu','排球少年'),('ハイキュー','排球少年'),
  ('英雄學院','英雄學院'),('my hero academia','英雄學院'),('boku no hero','英雄學院'),('ヒロアカ','英雄學院'),('僕のヒーロー','英雄學院'),
  ('鋼之鍊金術師','鋼煉'),('fullmetal alchemist','鋼煉'),('鋼の錬金術師','鋼煉'),('鋼煉','鋼煉'),
  ('迪士尼','迪士尼'),('disney','迪士尼'),
  ('漫威','漫威'),('marvel','漫威'),
  ('史努比','史努比'),('snoopy','史努比'),('peanuts','史努比'),
  ('小熊維尼','小熊維尼'),('winnie the pooh','小熊維尼'),('維尼','小熊維尼'),
  ('吉卜力','吉卜力'),('ghibli','吉卜力'),('studio ghibli','吉卜力'),('龍貓','吉卜力'),('天空之城','吉卜力'),('魔女宅急便','吉卜力'),
  ('初音未來','初音未來'),('hatsune miku','初音未來'),('初音ミク','初音未來'),('初音','初音未來'),
  ('黑執事','黑執事'),('black butler','黑執事'),('黒執事','黑執事'),
  ('刀劍神域','刀劍神域'),('sword art online','刀劍神域'),('sao','刀劍神域'),
  ('新世紀福音戰士','新世紀福音'),('evangelion','新世紀福音'),('eva','新世紀福音'),('エヴァ','新世紀福音'),
  ('庫洛魔法使','庫洛魔法使'),('cardcaptor sakura','庫洛魔法使'),('小櫻','庫洛魔法使'),
  ('美少女戰士','美少女戰士'),('sailor moon','美少女戰士'),('セーラームーン','美少女戰士'),
  ('名偵探柯南','名偵探柯南'),('柯南','名偵探柯南'),('detective conan','名偵探柯南'),('コナン','名偵探柯南'),
  ('哆啦a夢','哆啦A夢'),('doraemon','哆啦A夢'),('ドラえもん','哆啦A夢'),
  ('蠟筆小新','蠟筆小新'),('crayon shin-chan','蠟筆小新'),('shin-chan','蠟筆小新'),('クレヨンしんちゃん','蠟筆小新'),
  ('五等分的新娘','五等分新娘'),('五等分','五等分新娘'),
  ('re:zero','Re:Zero'),('從零開始','Re:Zero'),('リゼロ','Re:Zero'),
  ('夏目友人帳','夏目友人帳'),('natsume','夏目友人帳'),
  ('約定的夢幻島','約定夢幻島'),('promised neverland','約定夢幻島'),
  ('魔法少女小圓','魔法少女'),('puella magi','魔法少女'),('まどか','魔法少女')
ON CONFLICT (keyword) DO NOTHING;

-- 4. Function: detect series from product name via keyword lookup
CREATE OR REPLACE FUNCTION public.detect_series_from_name(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_series TEXT;
BEGIN
  SELECT series_name INTO v_series
  FROM public.series_keywords
  WHERE lower(p_name) LIKE '%' || lower(keyword) || '%'
  ORDER BY LENGTH(keyword) DESC  -- prefer longer (more specific) matches
  LIMIT 1;
  RETURN v_series;
END;
$$;

-- 5. Auto-populate series for existing active products that have none
UPDATE public.products
SET series = public.detect_series_from_name(name)
WHERE series IS NULL
  AND status IN ('active','selling','coming_soon')
  AND public.detect_series_from_name(name) IS NOT NULL;

-- 6. RPC: track a user event (fire-and-forget from frontend)
CREATE OR REPLACE FUNCTION public.track_user_event(
  p_event_type  TEXT,
  p_product_id  INT  DEFAULT NULL,
  p_series      TEXT DEFAULT NULL,
  p_session_id  TEXT DEFAULT NULL,
  p_meta        JSONB DEFAULT '{}'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.user_events (user_id, session_id, event_type, product_id, series, meta)
  VALUES (auth.uid(), p_session_id, p_event_type, p_product_id, p_series, p_meta);
END;
$$;
