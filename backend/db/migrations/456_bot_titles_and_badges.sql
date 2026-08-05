-- 456: 機器人補上稱號與成就徽章
--
-- 排行榜與玩家資訊小卡都會讀 user_titles / user_badges，
-- 但這兩張表被 427 清空了（PROD 各 0 筆），所以卡片上稱號與成就是空的。
--
-- ── 為什麼不會影響庫存與報表 ──
-- 這裡只寫 user_titles 與 user_badges，兩張都是純進度表：
--   * 不碰 product_prizes.remaining（庫存）
--   * 不碰 draw_records / recharge_records / token_adjustments（財務對帳基礎）
--   * 機器人帳號 is_bot = true，所有統計本來就會排除
-- 換句話說，這批資料只在「玩家看得到的地方」出現，不進任何一份帳。
--
-- ── 徽章依 total_draws 推導，不是亂給 ──
-- 帳號寫著抽過 700 次卻只有「初心試煉」，或抽過 3 次卻掛「命運支配者」，
-- 玩家一眼就看得出是假的。所以徽章門檻直接對齊 badges 表的語意，
-- 由每個帳號自己的 total_draws 決定拿到哪幾個。
--
-- 非抽獎類（儲值、邀請、幸運、隱藏）不可能從 total_draws 推得，
-- 改用帳號 id 的雜湊決定，讓分布看起來零散而不是整齊。

-- ── 抽獎類：完全由 total_draws 決定 ──────────────────────────────────────
INSERT INTO user_badges (user_id, badge_id, earned_at)
SELECT u.id, b.badge_id,
       u.created_at + (random() * (now() - u.created_at))
FROM users u
CROSS JOIN LATERAL (VALUES
  ('first_draw', 1), ('draw_30', 30), ('draw_100', 100),
  ('draw_500', 500), ('draw_1000', 1000), ('draw_5000', 5000)
) AS b(badge_id, threshold)
WHERE u.is_bot AND COALESCE(u.total_draws, 0) >= b.threshold
  -- 兩環境的 badges 定義不完全一致（STG 少 ranking_50），
  -- 不過濾的話缺漏那筆會撞外鍵讓整支失敗
  AND EXISTS (SELECT 1 FROM badges bb WHERE bb.id = b.badge_id)
ON CONFLICT DO NOTHING;

-- ── 其餘類別：用 id 雜湊決定，分布才會零散 ──────────────────────────────
INSERT INTO user_badges (user_id, badge_id, earned_at)
SELECT u.id, b.badge_id,
       u.created_at + (random() * (now() - u.created_at))
FROM users u
CROSS JOIN LATERAL (VALUES
  -- badge_id,          取得比例（0~1，越小越稀有）
  ('login_streak_7',    0.55), ('draw_streak_10',  0.40),
  ('login_streak_30',   0.25), ('draw_streak_20',  0.18),
  ('login_streak_100',  0.06),
  ('first_topup',       0.60), ('topup_1000',      0.42),
  ('topup_5000',        0.22), ('topup_20000',     0.10),
  ('topup_100000',      0.03), ('topup_streak_5',  0.20),
  ('topup_streak_10',   0.08),
  ('refer_1',           0.35), ('refer_5',         0.16),
  ('refer_20',          0.05), ('refer_100',       0.01),
  ('lucky_first',       0.45), ('lucky_day3',      0.12),
  ('lucky_10',          0.20), ('lucky_50',        0.04),
  ('duplicate_10',      0.30), ('single_day_100',  0.09),
  ('birthday_draw',     0.07), ('ranking_50',      0.15)
) AS b(badge_id, rate)
WHERE u.is_bot
  -- 用 uuid 尾碼＋badge_id 做穩定雜湊：同一個帳號重跑結果一致，不會每次都變
  AND (('x' || substr(md5(u.id::text || b.badge_id), 1, 8))::bit(32)::bigint & 2147483647)
      / 2147483647.0 < b.rate
  AND EXISTS (SELECT 1 FROM badges bb WHERE bb.id = b.badge_id)
ON CONFLICT DO NOTHING;

-- ── 稱號：有對應徽章才給 ────────────────────────────────────────────────
INSERT INTO user_titles (user_id, title_id, earned_at, is_selected)
SELECT ub.user_id, t.id, ub.earned_at, FALSE
FROM user_badges ub
JOIN titles t ON t.badge_id = ub.badge_id
JOIN users u  ON u.id = ub.user_id AND u.is_bot
ON CONFLICT DO NOTHING;

-- ── 每人選一個稱號顯示：挑最稀有的那個 ──────────────────────────────────
-- 資訊小卡只顯示 is_selected = TRUE 的那一個，沒選就是空白。
-- 稀有度用 badges.sort_order 近似（越後面越難拿）。
WITH ranked AS (
  SELECT ut.user_id, ut.title_id,
         row_number() OVER (PARTITION BY ut.user_id ORDER BY b.sort_order DESC) AS rn
  FROM user_titles ut
  JOIN titles t  ON t.id = ut.title_id
  JOIN badges b  ON b.id = t.badge_id
  JOIN users  u  ON u.id = ut.user_id AND u.is_bot
)
UPDATE user_titles ut SET is_selected = TRUE
FROM ranked r
WHERE ut.user_id = r.user_id AND ut.title_id = r.title_id AND r.rn = 1;

SELECT count(DISTINCT user_id) AS 有徽章的機器人, count(*) AS 徽章總數 FROM user_badges;
SELECT count(DISTINCT user_id) AS 有稱號的機器人,
       count(*) FILTER (WHERE is_selected) AS 已選稱號 FROM user_titles;
