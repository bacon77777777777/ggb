-- 509: 機器人的稱號／徽章必須撐得起牌面上的抽數
--
-- 症狀：鯰魚君累計 3 抽卻掛「火力全開」（單日 100 抽）。
-- 機器人補稱號時是亂數指派，沒對 total_draws 把關 —— 玩家點開資訊小卡
-- 一眼就看出是假的，直接打臉「排行榜有人氣」的目的。
--
-- 修法：給每種「抽獎相關」條件一個可信門檻（以 total_draws 為代理），
-- 不達門檻的徽章與稱號持有列整個移除（不只選中的 —— 持有清單也看得到），
-- 原本選中的稱號被移除者，從該抽數撐得起的池子重配一個。
-- 登入／儲值／邀請類條件與抽數無關，不動。
--
-- 可信門檻（寧可保守）：
--   total_draws       → 條件值本身
--   single_day_draws  → 條件值（單日都抽了 100，累計不可能低於 100）
--   top_prize_count 10→ 100 抽；50 → 300 抽（中大獎 ≈ 每 6~10 抽一次的量級）
--   top_prize_day3 3  → 30 抽
--
-- 註：user_titles 主鍵是 (user_id, title_id)，重配不能 UPDATE title_id
--（機器人可能已持有新稱號的另一列會撞鍵），要走 DELETE + upsert。

BEGIN;

-- ── 條件 → 可信抽數門檻 ──────────────────────────────────────────────
CREATE TEMP TABLE plaus(condition_type text, condition_value int, min_draws int);
INSERT INTO plaus
SELECT b.condition_type, b.condition_value,
  CASE b.condition_type
    WHEN 'total_draws'      THEN b.condition_value
    WHEN 'single_day_draws' THEN b.condition_value
    WHEN 'top_prize_count'  THEN CASE WHEN b.condition_value >= 50 THEN 300 ELSE 100 END
    WHEN 'top_prize_day3'   THEN 30
    ELSE 0
  END
FROM (SELECT DISTINCT condition_type, condition_value FROM badges) b;

-- ── 1) 移除機器人身上撐不起的徽章 ───────────────────────────────────
DELETE FROM user_badges ub
USING users u, badges b, plaus p
WHERE ub.user_id = u.id AND u.is_bot = true
  AND b.id = ub.badge_id
  AND p.condition_type = b.condition_type AND p.condition_value = b.condition_value
  AND u.total_draws < p.min_draws;

-- ── 2) 記下「選中的稱號撐不起」的機器人，稍後重配 ───────────────────
CREATE TEMP TABLE need_reassign AS
SELECT u.id AS user_id, u.total_draws
FROM users u
JOIN user_titles ut ON ut.user_id = u.id AND ut.is_selected
JOIN titles t ON t.id = ut.title_id
JOIN badges b ON b.id = t.badge_id
JOIN plaus p ON p.condition_type = b.condition_type AND p.condition_value = b.condition_value
WHERE u.is_bot = true AND u.total_draws < p.min_draws;

-- ── 3) 撐不起的稱號持有列整個移除（含未選中的 —— 持有清單也看得到）──
DELETE FROM user_titles ut
USING users u, titles t, badges b, plaus p
WHERE ut.user_id = u.id AND u.is_bot = true
  AND t.id = ut.title_id AND b.id = t.badge_id
  AND p.condition_type = b.condition_type AND p.condition_value = b.condition_value
  AND u.total_draws < p.min_draws;

-- ── 4) 重配：池子依抽數分層；hashtext(user_id) 決定選哪個，重跑結果一致 ──
WITH pool AS (
  SELECT nr.user_id,
    CASE
      WHEN nr.total_draws >= 500 THEN
        ARRAY['gacha_addict','full_power','chosen_one','fate_agent','lucky_king','full_attendance','true_fan','small_whale','popularity_king']
      WHEN nr.total_draws >= 300 THEN
        ARRAY['fate_agent','full_power','chosen_one','lucky_king','full_attendance','true_fan','small_whale','popularity_king']
      WHEN nr.total_draws >= 100 THEN
        ARRAY['full_power','chosen_one','lucky_king','full_attendance','true_fan','small_whale','legend_whale','popularity_king']
      WHEN nr.total_draws >= 30 THEN
        ARRAY['lucky_king','full_attendance','ggb_resident','true_fan','small_whale','legend_whale','popularity_king']
      ELSE
        ARRAY['full_attendance','ggb_resident','true_fan','small_whale','legend_whale','popularity_king']
    END AS titles
  FROM need_reassign nr
),
pick AS (
  SELECT p.user_id,
    p.titles[1 + abs(hashtext(p.user_id::text)) % array_length(p.titles, 1)] AS new_title
  FROM pool p
)
INSERT INTO user_titles (user_id, title_id, is_selected)
SELECT user_id, new_title, true FROM pick
ON CONFLICT (user_id, title_id) DO UPDATE SET is_selected = true;

-- ── 5) 新稱號對應的徽章要在徽章牆上（稱號是從徽章來的，缺了會露餡）──
INSERT INTO user_badges (user_id, badge_id)
SELECT ut.user_id, t.badge_id
FROM user_titles ut
JOIN users u ON u.id = ut.user_id AND u.is_bot = true
JOIN titles t ON t.id = ut.title_id
WHERE ut.is_selected AND t.badge_id IS NOT NULL
ON CONFLICT DO NOTHING;

COMMIT;
