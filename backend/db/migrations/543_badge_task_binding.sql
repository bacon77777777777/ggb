-- 徽章綁定成就任務
--
-- 站上原本有兩套各自獨立的成就：
--   A. tasks type='achievement' —— 簽到頁「成就」分頁，達標後按領取拿積分
--   B. badges                   —— check_achievements 在達標當下自動發，
--                                  而且會「另外再加一份積分」
-- 兩套 30 對 30、名稱幾乎一樣，但條件欄位命名不同（draw_count vs total_draws、
-- recharge_amount vs total_topup…），程式上完全沒有關聯，玩家等於同一個成就
-- 拿兩份積分，徽章還不用領。
--
-- 這裡建立明確的對應關係，之後徽章改成「領取任務時才發」。
-- 用 name/title 配對而不是 condition_type —— 兩邊命名對不上，只有名稱可靠。
-- 其中兩組是用字前後顛倒，特別處理：
--   任務「抽獎成癮」(500 抽) ↔ 徽章「抽獎成癮」  ← 名詞統一後已同名
--   任務「抽獎之神」(1000 抽) ↔ 徽章「抽獎之神」 ← 同上

ALTER TABLE badges ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

UPDATE badges b
SET task_id = t.id
FROM tasks t
WHERE t.type = 'achievement' AND t.title = b.name;

COMMENT ON COLUMN badges.task_id IS
  '對應的成就任務。玩家在簽到頁領取該任務時，才會拿到這顆徽章（migration 543）';
INSERT INTO badges (id,name,description,category,icon,condition_type,condition_value,points_reward,sort_order) VALUES ('ranking_50','排行榜信徒','累積膜拜排行榜 50 次','social','🏅','like_ranking',50,150,700) ON CONFLICT (id) DO NOTHING;
-- 補完後重新綁定（STG 少這顆徽章，PROD 執行時 ON CONFLICT 不會有事）
UPDATE badges b SET task_id = t.id FROM tasks t WHERE t.type='achievement' AND t.title = b.name AND b.task_id IS NULL;
