-- 648_point_ledger_opening.sql
--
-- 期初結轉：把每個現有玩家的積分餘額寫成帳本的第一筆。
--
-- 沒有這一步，`users.points = SUM(point_ledger.delta)` 這條對帳式子從第一天就
-- 不成立 —— 每次對帳都要有人記得「前面那一段是沒有帳本的年代」，然後手工解釋差額。
-- 遲早會有人忘記，然後把差額當成漏洞去查。
--
-- 一次性、可重跑：靠 idempotency_key = 'opening:<user_id>' 的唯一索引擋重複。

BEGIN;

INSERT INTO point_ledger (user_id, delta, balance_after, type, reason, idempotency_key, created_at)
SELECT
  u.id,
  u.points,
  u.points,
  'opening',
  '帳本啟用前的既有餘額（migration 648 一次性結轉）',
  'opening:' || u.id::text,
  now()
FROM users u
WHERE COALESCE(u.points, 0) <> 0
ON CONFLICT (idempotency_key) DO NOTHING;

COMMIT;

-- 驗收（兩個環境都要是 0 筆不符）：
--   SELECT count(*) FROM (
--     SELECT u.id, COALESCE(u.points,0) AS bal, COALESCE(SUM(l.delta),0) AS led
--     FROM users u LEFT JOIN point_ledger l ON l.user_id = u.id
--     GROUP BY u.id, u.points
--   ) t WHERE bal <> led;
