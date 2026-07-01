-- 200_seed_missions.sql
-- 建立完整任務資料（每日、每週、成就）

BEGIN;

-- 清除舊資料避免重複
TRUNCATE public.tasks RESTART IDENTITY CASCADE;

-- ── 每日任務 ──────────────────────────────────────────────────────────────────
INSERT INTO public.tasks (type, title, description, target_value, reward_coins, condition_type, icon_name, is_active) VALUES
  ('daily', '每日簽到',   '每天登入簽到一次',             1,   20, 'login',        'Log-in',   true),
  ('daily', '每日首抽',   '每日完成 1 次抽獎',            1,   30, 'draw_count',   'Ticket',   true),
  ('daily', '每日分享',   '分享吉吉比給朋友，推廣轉蛋樂趣', 1,   10, 'share_app',    'Share',    true);

-- ── 每週任務 ──────────────────────────────────────────────────────────────────
INSERT INTO public.tasks (type, title, description, target_value, reward_coins, condition_type, icon_name, is_active) VALUES
  ('weekly', '週間抽獎王',  '本週累積完成 10 次抽獎',      10,  200, 'draw_count',  'Layers',   true),
  ('weekly', '豪爽儲值',    '本週完成一次代幣儲值',         1,  100, 'spend_amount','Wallet',   true),
  ('weekly', '社群推廣大使','本週分享連結 3 次',            3,   50, 'share_app',   'Share',    true);

-- ── 成就 ──────────────────────────────────────────────────────────────────────
INSERT INTO public.tasks (type, title, description, target_value, reward_coins, condition_type, icon_name, is_active) VALUES
  ('achievement', '新手上路',   '累積完成 5 次抽獎',      5,    100, 'draw_count', 'Trophy',    true),
  ('achievement', '轉蛋愛好者', '累積完成 30 次抽獎',    30,    300, 'draw_count', 'Trophy',    true),
  ('achievement', '轉蛋達人',   '累積完成 100 次抽獎',  100,   1000, 'draw_count', 'Sparkles',  true),
  ('achievement', '轉蛋狂人',   '累積完成 500 次抽獎',  500,   5000, 'draw_count', 'Sparkles',  true),
  ('achievement', '分享大使',   '累積分享連結 10 次',    10,    200, 'share_app',  'Heart',     true),
  ('achievement', '第一次儲值', '完成人生第一次代幣儲值',  1,    150, 'spend_amount','Wallet',   true);

COMMIT;
