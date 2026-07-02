BEGIN;

-- 停用所有成就任務，重新依規格種入
UPDATE public.tasks SET is_active = FALSE WHERE type = 'achievement';

-- 🎰 抽蛋人生
INSERT INTO public.tasks (type, title, description, target_value, reward_coins, condition_type, icon_name, sort_order, is_active) VALUES
  ('achievement', '初心試煉',   '完成首次轉蛋',            1,      50, 'draw_count', 'Trophy',   101, TRUE),
  ('achievement', '命運啟程',   '累積完成 30 次轉蛋',      30,    200, 'draw_count', 'Trophy',   102, TRUE),
  ('achievement', '停不下來',   '累積完成 100 次轉蛋',    100,    800, 'draw_count', 'Trophy',   103, TRUE),
  ('achievement', '轉蛋成癮',   '累積完成 500 次轉蛋',    500,   5000, 'draw_count', 'Medal',    104, TRUE),
  ('achievement', '抽蛋之神',   '累積完成 1,000 次轉蛋', 1000,  15000, 'draw_count', 'Medal',    105, TRUE),
  ('achievement', '命運支配者', '累積完成 5,000 次轉蛋', 5000, 100000, 'draw_count', 'Medal',    106, TRUE),

-- 📅 活躍玩家
  ('achievement', '每日修行', '連續 10 天完成轉蛋',    10,   300, 'draw_streak',  'Calendar', 201, TRUE),
  ('achievement', '永不缺席', '連續 20 天完成轉蛋',    20,   800, 'draw_streak',  'Calendar', 202, TRUE),
  ('achievement', '習慣養成', '連續登入 7 天',           7,   100, 'login_streak', 'Log-in',   203, TRUE),
  ('achievement', '全勤戰士', '連續登入 30 天',         30,   500, 'login_streak', 'Log-in',   204, TRUE),
  ('achievement', '常駐居民', '連續登入 100 天',       100,  2000, 'login_streak', 'Log-in',   205, TRUE),

-- 💳 課長之路
  ('achievement', '初次獻祭', '首次儲值',                        1,     200, 'recharge',       'Wallet', 301, TRUE),
  ('achievement', '小課怡情', '累積儲值 1,000 代幣',          1000,     500, 'recharge_amount','Wallet', 302, TRUE),
  ('achievement', '荷包失守', '累積儲值 5,000 代幣',          5000,    2000, 'recharge_amount','Wallet', 303, TRUE),
  ('achievement', '錢包蒸發', '累積儲值 20,000 代幣',        20000,    8000, 'recharge_amount','Wallet', 304, TRUE),
  ('achievement', '課長降臨', '累積儲值 100,000 代幣',      100000,   50000, 'recharge_amount','Wallet', 305, TRUE),
  ('achievement', '每日供奉', '連續 5 天有儲值',                  5,     500, 'topup_streak',   'Wallet', 306, TRUE),
  ('achievement', '信仰充值', '連續 10 天有儲值',                10,    2000, 'topup_streak',   'Wallet', 307, TRUE),

-- 🤝 揪團高手
  ('achievement', '初級召集人', '成功邀請 1 位好友',     1,    200, 'invite_friend', 'Users', 401, TRUE),
  ('achievement', '揪團王',     '成功邀請 5 位好友',     5,   1000, 'invite_friend', 'Users', 402, TRUE),
  ('achievement', '傳教士',     '成功邀請 20 位好友',   20,   5000, 'invite_friend', 'Users', 403, TRUE),
  ('achievement', '信徒滿天下', '成功邀請 100 位好友', 100,  30000, 'invite_friend', 'Users', 404, TRUE),

-- 🍀 歐皇傳說
  ('achievement', '一發入魂', '第一次轉蛋即抽中最高獎',   1,    500, 'top_prize_first', 'Star', 501, TRUE),
  ('achievement', '天命之子', '單日抽中最高獎 3 次',       3,   1000, 'top_prize_day3',  'Star', 502, TRUE),
  ('achievement', '命運眷顧', '累積抽中最高獎 10 次',     10,   5000, 'top_prize_count', 'Star', 503, TRUE),
  ('achievement', '神明代抽', '累積抽中最高獎 50 次',     50,  20000, 'top_prize_count', 'Star', 504, TRUE),

-- ☠️ 隱藏成就
  ('achievement', '非洲酋長', '連續 10 抽未抽中最高獎',  10,    500, 'bad_luck_streak',  'Sparkles', 601, TRUE),
  ('achievement', '火力全開', '單日完成 100 次轉蛋',    100,   2000, 'single_day_draws', 'Sparkles', 602, TRUE),
  ('achievement', '壽星最大', '生日當天完成 1 次轉蛋',    1,    200, 'birthday_draw',    'Sparkles', 603, TRUE)

ON CONFLICT DO NOTHING;

COMMIT;
