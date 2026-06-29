BEGIN;

WITH new_tasks(type, title, description, target_value, reward_coins, condition_type, icon_name) AS (
  VALUES
    ('daily', '每日登入（加碼）', '本日首次登入網站（加碼版）', 1, 5, 'login', 'Log-in'),
    ('daily', '探索 5 商品', '本日瀏覽 5 個不同的商品頁', 5, 15, 'view_product', 'Search'),
    ('daily', '探索 10 商品', '本日瀏覽 10 個不同的商品頁', 10, 25, 'view_product', 'Search'),
    ('daily', '分享兩次', '本日分享 2 次抽卡結果或商品連結', 2, 20, 'share_app', 'Share'),
    ('daily', '膜拜 3 次', '本日於排行榜完成 3 次膜拜/按讚', 3, 20, 'like_ranking', 'Heart'),
    ('daily', '小試手氣', '本日完成 2 次任意商品抽卡', 2, 20, 'draw_count', 'Ticket'),
    ('daily', '今日抽卡 15 次', '本日累計完成 15 次抽卡', 15, 50, 'draw_count', 'Layers'),
    ('daily', '今日消耗 1,000', '本日累計消耗 1,000 代幣', 1000, 30, 'spend_amount', 'Coins'),
    ('daily', '今日儲值 2 次', '本日完成 2 次代幣儲值', 2, 40, 'recharge', 'Wallet'),
    ('daily', '今日歐皇', '本日獲得 2 次 SR (含) 以上獎項', 2, 40, 'win_sr', 'Sparkles'),

    ('weekly', '每週探索 20 商品', '本週瀏覽 20 個不同的商品頁', 20, 100, 'view_product', 'Compass'),
    ('weekly', '每週探索 50 商品', '本週瀏覽 50 個不同的商品頁', 50, 200, 'view_product', 'Compass'),
    ('weekly', '每週分享 5 次', '本週分享 5 次抽卡結果或商品連結', 5, 120, 'share_app', 'Share'),
    ('weekly', '每週膜拜 10 次', '本週於排行榜完成 10 次膜拜/按讚', 10, 120, 'like_ranking', 'Heart'),
    ('weekly', '每週抽卡 200 次', '本週累計完成 200 次抽卡', 200, 300, 'draw_count', 'Flame'),
    ('weekly', '每週消耗 10,000', '本週累計消耗 10,000 代幣', 10000, 200, 'spend_amount', 'Coins'),
    ('weekly', '每週儲值 3 次', '本週完成 3 次代幣儲值', 3, 150, 'recharge', 'Wallet'),
    ('weekly', '每週歐皇 5 次', '本週獲得 5 次 SR (含) 以上獎項', 5, 250, 'win_sr', 'Crown'),
    ('weekly', '機台收藏家', '本週參與過 5 種不同的抽卡機台/卡包', 5, 250, 'play_unique_machine', 'Package'),
    ('weekly', '全勤再加碼', '本週累計登入達 7 天（加碼版）', 7, 80, 'login', 'Calendar-Check'),

    ('achievement', '新手成就：10 抽', '累積完成 10 次抽卡', 10, 50, 'draw_count', 'Trophy'),
    ('achievement', '抽卡小高手：100 抽', '累積完成 100 次抽卡', 100, 200, 'draw_count', 'Trophy'),
    ('achievement', '抽卡大師：500 抽', '累積完成 500 次抽卡', 500, 800, 'draw_count', 'Medal'),
    ('achievement', '收藏家：50 商品', '累積瀏覽 50 個不同的商品頁', 50, 150, 'view_product', 'Book'),
    ('achievement', '收藏家：200 商品', '累積瀏覽 200 個不同的商品頁', 200, 500, 'view_product', 'Book'),
    ('achievement', '社群推廣者', '累積分享 20 次抽卡結果或商品連結', 20, 300, 'share_app', 'Share'),
    ('achievement', '排行榜信徒', '累積於排行榜完成 50 次膜拜/按讚', 50, 300, 'like_ranking', 'Heart'),
    ('achievement', '課金新星', '累積完成 5 次代幣儲值', 5, 300, 'recharge', 'Wallet'),
    ('achievement', '歐氣常駐', '累積獲得 20 次 SR (含) 以上獎項', 20, 600, 'win_sr', 'Sparkles'),
    ('achievement', '機台通', '累積參與過 10 種不同的抽卡機台/卡包', 10, 600, 'play_unique_machine', 'Compass')
)
INSERT INTO public.tasks (type, title, description, target_value, reward_coins, condition_type, icon_name)
SELECT
  n.type,
  n.title,
  n.description,
  n.target_value,
  n.reward_coins,
  n.condition_type,
  n.icon_name
FROM new_tasks n
WHERE NOT EXISTS (
  SELECT 1
  FROM public.tasks t
  WHERE t.type = n.type AND t.title = n.title
);

COMMIT;

