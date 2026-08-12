-- 任務去重 + 積分重新定價
--
-- ── 問題一：同一個條件同一個目標，卻有兩個任務、獎勵差好幾倍
--   每週抽 30 次：「抽獎30次」350 分 vs「抽獎狂神」90 分 —— 差 3.9 倍
--   每週抽 10 次：「抽獎10次」80 分 vs「抽獎使者」45 分 —— 差 1.8 倍
--   每日抽 1 次：「完成1次抽獎」10 vs「每日首抽」9
--   每日抽 3 次：「完成3次抽獎」20 vs「手氣大爆發」15
--   每日登入   ：「每日簽到」6 vs「每日登入」5
--   每日分享   ：「每日分享」6 vs「分享任一商品」5
--   玩家會發現「做一樣的事拿不一樣的獎勵」，比數字大小本身更傷。
--
-- ── 問題二：兩筆任務的條件型別是錯的（形同白送）
--   「豪爽儲值」「儲值達人」描述寫「本週完成 3／5 次儲值」，但 condition_type
--   是 spend_amount —— 那個型別在別處代表「代幣金額」（消費100代幣）。
--   照現況實作，消費 3 代幣就達標拿 45 分。一併移除。
--
-- ── 問題三：成就的回饋率遞減（越難越不划算）
--   停不下來（100 抽，約 15,000 G）300 分 → 0.5%
--   命運支配者（5,000 抽，約 750,000 G）8,000 分 → 0.27%
--   邀 1 人每人值 25 G，邀 100 人每人只值 20 G。
--   改成費率隨階梯微升（1.1% → 2.0%），里程碑才有里程碑的感覺。
--
-- 幣值基準：4 積分 = 1 G（前台 GachaProductDetail 的 pointsCost = totalPrice * 4）。
-- 抽獎類成就以單抽均價 150 G 估算投入量。
--
-- 註：user_task_progress 對 tasks 是 ON DELETE CASCADE，刪任務會連帶清掉
--     該任務的進度與領取記錄 —— 這裡刪的都是重複／錯誤任務，可接受。

-- ── 1. 刪除重複與錯誤的任務 ──────────────────────────────────────────
DELETE FROM tasks WHERE type='daily'  AND title IN ('每日首抽','手氣大爆發','每日登入','分享任一商品');
DELETE FROM tasks WHERE type='weekly' AND title IN ('抽獎使者','抽獎狂神','豪爽儲值','儲值達人');

-- ── 2. 每日任務定價（全清約 235 分 ≈ 半抽）────────────────────────────
UPDATE tasks SET reward_coins = 10 WHERE type='daily' AND title='每日簽到';
UPDATE tasks SET reward_coins = 10 WHERE type='daily' AND title='每日分享';
UPDATE tasks SET reward_coins = 15 WHERE type='daily' AND title='分享邀請給好友';
UPDATE tasks SET reward_coins = 15 WHERE type='daily' AND title='完成1次抽獎';
UPDATE tasks SET reward_coins = 30 WHERE type='daily' AND title='完成3次抽獎';
UPDATE tasks SET reward_coins = 50 WHERE type='daily' AND title='每日連抽';
UPDATE tasks SET reward_coins = 10 WHERE type='daily' AND title='瀏覽5個商品';
UPDATE tasks SET reward_coins = 10 WHERE type='daily' AND title='排行榜膜拜1次';
UPDATE tasks SET reward_coins = 20 WHERE type='daily' AND title='今日首次儲值';
UPDATE tasks SET reward_coins = 15 WHERE type='daily' AND title='每日儲值';
UPDATE tasks SET reward_coins = 10 WHERE type='daily' AND title='消耗20積分';
UPDATE tasks SET reward_coins = 40 WHERE type='daily' AND title='完成全部每日任務';

-- ── 3. 每週任務定價（儲值／消費維持原本已一致的 10%～12.5% 回饋）──────
UPDATE tasks SET reward_coins = 100 WHERE type='weekly' AND title='抽獎10次';
UPDATE tasks SET reward_coins = 220 WHERE type='weekly' AND title='抽獎20次';
UPDATE tasks SET reward_coins = 350 WHERE type='weekly' AND title='抽獎30次';
UPDATE tasks SET reward_coins = 650 WHERE type='weekly' AND title='抽獎衝刺';
UPDATE tasks SET reward_coins =  60 WHERE type='weekly' AND title='累積登入5天';
UPDATE tasks SET reward_coins =  20 WHERE type='weekly' AND title='社群推廣大使';
UPDATE tasks SET reward_coins =  30 WHERE type='weekly' AND title='分享達人';
-- 「邀請 1 位好友」維持 100 —— 與邀請好友頁的里程碑機制連動，老闆指定不動

-- ── 4. 成就定價（費率隨階梯微升）──────────────────────────────────────
UPDATE tasks SET reward_coins =    50 WHERE type='achievement' AND condition_type='draw_count'      AND target_value=1;
UPDATE tasks SET reward_coins =   200 WHERE type='achievement' AND condition_type='draw_count'      AND target_value=30;
UPDATE tasks SET reward_coins =   700 WHERE type='achievement' AND condition_type='draw_count'      AND target_value=100;
UPDATE tasks SET reward_coins =  4500 WHERE type='achievement' AND condition_type='draw_count'      AND target_value=500;
UPDATE tasks SET reward_coins = 10000 WHERE type='achievement' AND condition_type='draw_count'      AND target_value=1000;
UPDATE tasks SET reward_coins = 60000 WHERE type='achievement' AND condition_type='draw_count'      AND target_value=5000;

UPDATE tasks SET reward_coins =   100 WHERE type='achievement' AND condition_type='recharge';
UPDATE tasks SET reward_coins =   300 WHERE type='achievement' AND condition_type='recharge_amount' AND target_value=1000;
UPDATE tasks SET reward_coins =  1600 WHERE type='achievement' AND condition_type='recharge_amount' AND target_value=5000;
UPDATE tasks SET reward_coins =  7000 WHERE type='achievement' AND condition_type='recharge_amount' AND target_value=20000;
UPDATE tasks SET reward_coins = 40000 WHERE type='achievement' AND condition_type='recharge_amount' AND target_value=100000;

UPDATE tasks SET reward_coins =   150 WHERE type='achievement' AND condition_type='invite_friend'   AND target_value=1;
UPDATE tasks SET reward_coins =   800 WHERE type='achievement' AND condition_type='invite_friend'   AND target_value=5;
UPDATE tasks SET reward_coins =  3500 WHERE type='achievement' AND condition_type='invite_friend'   AND target_value=20;
UPDATE tasks SET reward_coins = 20000 WHERE type='achievement' AND condition_type='invite_friend'   AND target_value=100;

-- 沒有「累積投入」可對照的，照達成難度排五檔：100 / 300 / 800 / 2000 / 5000
UPDATE tasks SET reward_coins =   100 WHERE type='achievement' AND condition_type='login_streak'    AND target_value=7;
UPDATE tasks SET reward_coins =   300 WHERE type='achievement' AND condition_type='login_streak'    AND target_value=30;
UPDATE tasks SET reward_coins =   800 WHERE type='achievement' AND condition_type='login_streak'    AND target_value=100;
UPDATE tasks SET reward_coins =   300 WHERE type='achievement' AND condition_type='draw_streak'     AND target_value=10;
UPDATE tasks SET reward_coins =   800 WHERE type='achievement' AND condition_type='draw_streak'     AND target_value=20;
UPDATE tasks SET reward_coins =   300 WHERE type='achievement' AND condition_type='topup_streak'    AND target_value=5;
UPDATE tasks SET reward_coins =   800 WHERE type='achievement' AND condition_type='topup_streak'    AND target_value=10;
UPDATE tasks SET reward_coins =   300 WHERE type='achievement' AND condition_type='top_prize_first';
UPDATE tasks SET reward_coins =   800 WHERE type='achievement' AND condition_type='top_prize_day3';
UPDATE tasks SET reward_coins =  2000 WHERE type='achievement' AND condition_type='top_prize_count' AND target_value=10;
UPDATE tasks SET reward_coins =  5000 WHERE type='achievement' AND condition_type='top_prize_count' AND target_value=50;
UPDATE tasks SET reward_coins =  2000 WHERE type='achievement' AND condition_type='single_day_draws';
UPDATE tasks SET reward_coins =   300 WHERE type='achievement' AND condition_type='like_ranking';
UPDATE tasks SET reward_coins =   300 WHERE type='achievement' AND condition_type='birthday_draw';
UPDATE tasks SET reward_coins =   300 WHERE type='achievement' AND condition_type='bad_luck_streak';
