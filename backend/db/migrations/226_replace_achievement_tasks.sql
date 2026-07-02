BEGIN;

-- 停用所有舊成就任務
UPDATE public.tasks
SET is_active = FALSE
WHERE type = 'achievement';

-- 新增正確的成就任務（若同標題已存在則跳過）
INSERT INTO public.tasks (type, title, description, target_value, reward_coins, condition_type, icon_name, is_active)
VALUES
  ('achievement', '新手上路',     '累積完成 10 次轉蛋',                    10,   50,  'draw_count',          'Trophy',   TRUE),
  ('achievement', '轉蛋愛好者',   '累積完成 30 次轉蛋',                    30,   200, 'draw_count',          'Trophy',   TRUE),
  ('achievement', '轉蛋達人',     '累積完成 100 次轉蛋',                  100,   500, 'draw_count',          'Trophy',   TRUE),
  ('achievement', '轉蛋狂人',     '累積完成 500 次轉蛋',                  500,  1500, 'draw_count',          'Medal',    TRUE),
  ('achievement', '抽蛋之神',     '累積完成 1,000 次轉蛋',               1000,  5000, 'draw_count',          'Medal',    TRUE),
  ('achievement', '課金新星',     '首次儲值代幣',                            1,   200, 'recharge',            'Wallet',   TRUE),
  ('achievement', '荷包失守',     '累積儲值達 5 次',                         5,   500, 'recharge',            'Wallet',   TRUE),
  ('achievement', '社群推廣者',   '累積分享 20 次',                         20,   300, 'share_app',           'Share',    TRUE),
  ('achievement', '排行榜信徒',   '累積膜拜排行榜 50 次',                   50,   300, 'like_ranking',        'Heart',    TRUE),
  ('achievement', '每日常客',     '累積登入 30 天',                         30,   300, 'login',               'Calendar', TRUE)
ON CONFLICT DO NOTHING;

COMMIT;
