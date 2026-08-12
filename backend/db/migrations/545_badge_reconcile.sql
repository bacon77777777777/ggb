-- 既有徽章與積分對帳
--
-- 成就改成「領取才發」之後，歷史資料要跟新規則對齊。老闆的原則是
-- 「以領取狀態為準，有領就給、沒領就收回」，而且自動發出去的積分要退回。
--
-- ── 為什麼要退積分
-- 舊的 check_achievements 在達標當下就把 badges.points_reward 加進玩家帳戶，
-- 玩家同時又能在簽到頁領同一個成就的 tasks.reward_coins —— 一個成就領兩份。
-- 新制只發 tasks 那一份，所以 badges 那份要收回，否則早期玩家永遠多拿一筆。
--
-- ── 機器人不動
-- 那 1,500 多筆是排行榜與玩家小卡的展示資料，沒有領取行為也不該有。
-- 收回的話小卡的徽章格會整片開天窗，人氣假數據就破功了。
--
-- ── 積分不會扣成負的
-- 玩家可能已經把積分折抵掉了，用 GREATEST(0, ...) 夾住；
-- 這種情況下等於平台吸收差額，不會讓玩家看到負數。

-- 1) 先把要退的金額算出來（只算真實用戶、且對應成就未領取的徽章）
CREATE TEMP TABLE _revoke AS
SELECT ub.user_id, ub.badge_id, COALESCE(b.points_reward, 0) AS pts
FROM user_badges ub
JOIN badges b ON b.id = ub.badge_id
JOIN users  u ON u.id = ub.user_id
WHERE (u.is_bot IS NULL OR u.is_bot = FALSE)
  AND NOT EXISTS (
    SELECT 1 FROM user_task_progress p
    WHERE p.user_id = ub.user_id AND p.task_id = b.task_id AND p.is_claimed
  );

-- 2) 退積分
UPDATE users u
SET points = GREATEST(0, COALESCE(u.points, 0) - r.total)
FROM (SELECT user_id, SUM(pts) AS total FROM _revoke GROUP BY user_id) r
WHERE u.id = r.user_id;

-- 3) 收回徽章
DELETE FROM user_badges ub USING _revoke r
WHERE ub.user_id = r.user_id AND ub.badge_id = r.badge_id;

-- 4) 連帶收回那些徽章掛的稱號（沒領到徽章就不該有稱號）
DELETE FROM user_titles ut
USING titles t
WHERE ut.title_id = t.id
  AND t.badge_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM user_badges ub WHERE ub.user_id = ut.user_id AND ub.badge_id = t.badge_id
  )
  AND EXISTS (SELECT 1 FROM users u WHERE u.id = ut.user_id AND (u.is_bot IS NULL OR u.is_bot = FALSE));

DROP TABLE _revoke;
