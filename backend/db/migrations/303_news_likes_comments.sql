-- 文章按讚
CREATE TABLE IF NOT EXISTS news_likes (
  news_id    TEXT        NOT NULL,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (news_id, user_id)
);

-- 文章留言
CREATE TABLE IF NOT EXISTS news_comments (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  news_id    TEXT        NOT NULL,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content    TEXT        NOT NULL CHECK (char_length(content) >= 1 AND char_length(content) <= 300),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 留言按讚
CREATE TABLE IF NOT EXISTS news_comment_likes (
  comment_id UUID        NOT NULL REFERENCES news_comments(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS news_comments_news_id_idx ON news_comments(news_id, created_at DESC);
CREATE INDEX IF NOT EXISTS news_likes_news_id_idx    ON news_likes(news_id);

-- RLS
ALTER TABLE news_likes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_comments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_comment_likes ENABLE ROW LEVEL SECURITY;

-- news_likes policies (公開讀，登入才能操作)
CREATE POLICY "nl_select" ON news_likes FOR SELECT USING (true);
CREATE POLICY "nl_insert" ON news_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "nl_delete" ON news_likes FOR DELETE USING (auth.uid() = user_id);

-- news_comments policies
CREATE POLICY "nc_select" ON news_comments FOR SELECT USING (true);
CREATE POLICY "nc_insert" ON news_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "nc_delete" ON news_comments FOR DELETE USING (auth.uid() = user_id);

-- news_comment_likes policies
CREATE POLICY "ncl_select" ON news_comment_likes FOR SELECT USING (true);
CREATE POLICY "ncl_insert" ON news_comment_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ncl_delete" ON news_comment_likes FOR DELETE USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
