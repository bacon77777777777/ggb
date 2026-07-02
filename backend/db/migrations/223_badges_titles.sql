-- =============================================
-- 成就、勳章、稱號系統
-- =============================================

-- 1. badges 勳章定義
CREATE TABLE IF NOT EXISTS public.badges (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  category    TEXT NOT NULL, -- draw / active / spend / social / lucky / hidden
  icon        TEXT NOT NULL DEFAULT '🏅',
  condition_type  TEXT NOT NULL,
  condition_value INTEGER,
  points_reward   INTEGER DEFAULT 0,
  sort_order      INTEGER DEFAULT 0
);

-- 2. titles 稱號定義
CREATE TABLE IF NOT EXISTS public.titles (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  badge_id    TEXT REFERENCES public.badges(id),
  color_key   TEXT DEFAULT 'gold', -- gold / purple / red / blue / green
  sort_order  INTEGER DEFAULT 0
);

-- 3. user_badges 已獲得勳章
CREATE TABLE IF NOT EXISTS public.user_badges (
  user_id   UUID REFERENCES public.users(id) ON DELETE CASCADE,
  badge_id  TEXT REFERENCES public.badges(id),
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, badge_id)
);

-- 4. user_titles 已獲得稱號
CREATE TABLE IF NOT EXISTS public.user_titles (
  user_id     UUID REFERENCES public.users(id) ON DELETE CASCADE,
  title_id    TEXT REFERENCES public.titles(id),
  earned_at   TIMESTAMPTZ DEFAULT NOW(),
  is_selected BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (user_id, title_id)
);

-- 確保同一用戶只有一個 is_selected=true
CREATE UNIQUE INDEX IF NOT EXISTS user_titles_selected_unique
  ON public.user_titles (user_id)
  WHERE is_selected = TRUE;

-- 需要的額外欄位
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS login_streak      INTEGER DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS draw_streak       INTEGER DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_login_date   DATE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_draw_date    DATE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS total_topup       NUMERIC DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS topup_streak      INTEGER DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_topup_date   DATE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS total_referrals   INTEGER DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS top_prize_count   INTEGER DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS duplicate_count   INTEGER DEFAULT 0;

-- =============================================
-- Seed 勳章資料
-- =============================================

INSERT INTO public.badges (id, name, description, category, icon, condition_type, condition_value, points_reward, sort_order) VALUES

-- 🎰 抽蛋人生
('first_draw',     '初心試煉', '完成首次轉蛋',         'draw', '🌱', 'total_draws', 1,    50,     1),
('draw_30',        '命運啟程', '累積完成 30 次轉蛋',    'draw', '🎯', 'total_draws', 30,   200,    2),
('draw_100',       '停不下來', '累積完成 100 次轉蛋',   'draw', '🔥', 'total_draws', 100,  800,    3),
('draw_500',       '轉蛋成癮', '累積完成 500 次轉蛋',   'draw', '⚡', 'total_draws', 500,  5000,   4),
('draw_1000',      '抽蛋之神', '累積完成 1,000 次轉蛋', 'draw', '👑', 'total_draws', 1000, 15000,  5),
('draw_5000',      '命運支配者','累積完成 5,000 次轉蛋', 'draw', '🌌', 'total_draws', 5000, 100000, 6),

-- 📅 活躍玩家
('draw_streak_10', '每日修行',  '連續 10 天完成轉蛋',   'active', '📿', 'draw_streak',  10,  300,  7),
('draw_streak_20', '永不缺席',  '連續 20 天完成轉蛋',   'active', '💎', 'draw_streak',  20,  800,  8),
('login_streak_7', '習慣養成',  '連續登入 7 天',        'active', '📅', 'login_streak', 7,   100,  9),
('login_streak_30','全勤戰士',  '連續登入 30 天',       'active', '🛡️', 'login_streak', 30,  500,  10),
('login_streak_100','常駐居民', '連續登入 100 天',      'active', '🏠', 'login_streak', 100, 2000, 11),

-- 💳 課長之路
('first_topup',    '初次獻祭',  '首次儲值',             'spend', '💳', 'total_topup',  1,      200,   12),
('topup_1000',     '小課怡情',  '累積儲值 1,000 代幣',  'spend', '💰', 'total_topup',  1000,   500,   13),
('topup_5000',     '荷包失守',  '累積儲值 5,000 代幣',  'spend', '💸', 'total_topup',  5000,   2000,  14),
('topup_20000',    '錢包蒸發',  '累積儲值 20,000 代幣', 'spend', '🌊', 'total_topup',  20000,  8000,  15),
('topup_100000',   '課長降臨',  '累積儲值 100,000 代幣','spend', '🏆', 'total_topup',  100000, 50000, 16),
('topup_streak_5', '每日供奉',  '連續 5 天有儲值',      'spend', '🕯️', 'topup_streak', 5,    500,   17),
('topup_streak_10','信仰充值',  '連續 10 天有儲值',     'spend', '⛩️', 'topup_streak', 10,   2000,  18),

-- 🤝 揪團高手
('refer_1',  '初級召集人', '成功邀請 1 位好友',   'social', '🤝', 'total_referrals', 1,   200,   19),
('refer_5',  '揪團王',     '成功邀請 5 位好友',   'social', '👥', 'total_referrals', 5,   1000,  20),
('refer_20', '傳教士',     '成功邀請 20 位好友',  'social', '📢', 'total_referrals', 20,  5000,  21),
('refer_100','信徒滿天下', '成功邀請 100 位好友', 'social', '🌍', 'total_referrals', 100, 30000, 22),

-- 🍀 歐皇傳說
('lucky_first', '一發入魂',  '首次轉蛋即抽中最高獎',     'lucky', '⭐', 'top_prize_first', 1, 500,   23),
('lucky_day3',  '天命之子',  '單日抽中最高獎 3 次',       'lucky', '🌟', 'top_prize_day3',  3, 1000,  24),
('lucky_10',    '命運眷顧',  '累積抽中最高獎 10 次',      'lucky', '✨', 'top_prize_count', 10, 5000,  25),
('lucky_50',    '神明代抽',  '累積抽中最高獎 50 次',      'lucky', '🌠', 'top_prize_count', 50, 20000, 26),

-- ☠️ 隱藏成就
('duplicate_10', '非洲酋長',  '收到 10 個重複商品',          'hidden', '💀', 'duplicate_count',  10,  500,  27),
('single_day_100','火力全開', '單日完成 100 次轉蛋',         'hidden', '💥', 'single_day_draws', 100, 2000, 28),
('birthday_draw', '壽星最大', '生日當天完成 1 次轉蛋',       'hidden', '🎂', 'birthday_draw',    1,   200,  29)

ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  points_reward = EXCLUDED.points_reward;

-- =============================================
-- Seed 稱號資料
-- =============================================

INSERT INTO public.titles (id, name, badge_id, color_key, sort_order) VALUES
('gacha_addict',   '轉蛋狂熱者',  'draw_500',      'purple', 1),
('gacha_god',      '抽蛋之神',    'draw_1000',     'gold',   2),
('fate_ruler',     '命運支配者',  'draw_5000',     'red',    3),
('full_attendance','全勤戰士',    'login_streak_30','green', 4),
('ggb_resident',   '吉吉比居民',  'login_streak_100','blue', 5),
('small_whale',    '小課玩家',    'topup_20000',   'purple', 6),
('legend_whale',   '傳說課長',    'topup_100000',  'gold',   7),
('true_fan',       '真愛玩家',    'topup_streak_10','red',   8),
('popularity_king','人氣王',      'refer_20',      'blue',   9),
('ambassador',     '推廣大使',    'refer_100',     'green',  10),
('lucky_king',     '歐皇',        'lucky_day3',    'gold',   11),
('chosen_one',     '天選之人',    'lucky_10',      'purple', 12),
('fate_agent',     '命運代行者',  'lucky_50',      'red',    13),
('full_power',     '火力全開',    'single_day_100','red',    14)

ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  color_key = EXCLUDED.color_key;

-- RLS
ALTER TABLE public.badges     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.titles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_titles ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "badges_public_read"      ON public.badges      FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "titles_public_read"      ON public.titles      FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "user_badges_own_read"    ON public.user_badges FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "user_badges_public_read" ON public.user_badges FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "user_titles_own_read"    ON public.user_titles FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "user_titles_own_write"   ON public.user_titles FOR ALL    USING (auth.uid() = user_id);
