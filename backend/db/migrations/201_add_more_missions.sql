-- 201_add_more_missions.sql
-- 每日補到 5 個、每週補到 5 個（不動成就）

BEGIN;

-- 每日新增 2
INSERT INTO public.tasks (type, title, description, target_value, reward_coins, condition_type, icon_name, is_active) VALUES
  ('daily', '手氣大爆發',   '每日累積完成 3 次抽獎',   3,  60, 'draw_count',   'Sparkles', true),
  ('daily', '每日儲值',     '每日完成一次代幣儲值',     1,  50, 'spend_amount', 'Wallet',   true);

-- 每週新增 2
INSERT INTO public.tasks (type, title, description, target_value, reward_coins, condition_type, icon_name, is_active) VALUES
  ('weekly', '抽獎狂熱',   '本週累積完成 30 次抽獎',  30, 500, 'draw_count',  'Sparkles', true),
  ('weekly', '分享達人',   '本週分享連結 5 次',         5,  80, 'share_app',   'Heart',    true);

COMMIT;
