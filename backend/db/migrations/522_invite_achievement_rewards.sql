-- 522: 邀請好友成就獎勵重訂（老闆：送太少）
--
-- 原本 1/5/20/100 位 = 30/100/250/500 分，跟全站尺度嚴重脫節：
-- 邀 100 位真人（每位都要綁 LINE）竟然低於「連續登入 100 天」的 800 分，
-- 也遠低於「儲值 20000」的 2000 分。邀請是最難的一項，卻排在最底。
--
-- 對照現有錨點：抽 5000 次 = 8000／儲值 10 萬 = 6000／抽 1000 次 = 2500。
-- 新的階梯把「邀 100 位」拉到跟最高階成就同級，中段等比放大。
--
-- 注意：這是「成就」的一次性獎勵，跟邀請頁「每 5 位循環送 100 分」是兩條線，
-- 那條在 apply_line_perks / 邀請頁自己算，這裡不動。

UPDATE tasks SET reward_coins = 100  WHERE type='achievement' AND condition_type='invite_friend' AND target_value = 1;
UPDATE tasks SET reward_coins = 400  WHERE type='achievement' AND condition_type='invite_friend' AND target_value = 5;
UPDATE tasks SET reward_coins = 1500 WHERE type='achievement' AND condition_type='invite_friend' AND target_value = 20;
UPDATE tasks SET reward_coins = 8000 WHERE type='achievement' AND condition_type='invite_friend' AND target_value = 100;

-- 週任務「邀請 1 位好友」100 分維持不變（每週可重複拿，已經是週任務裡最高的）

SELECT type, title, target_value, reward_coins
FROM tasks WHERE condition_type='invite_friend' ORDER BY type, target_value;
