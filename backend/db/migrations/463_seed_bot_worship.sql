-- 463: 機器人的被膜拜次數
--
-- 資訊小卡新增「被膜拜 N 次」之後，機器人如果全是 0，一點開就穿幫。
--
-- worship_logs 是純社交表：不碰庫存、不進財務對帳、不影響銷量統計，
-- 所以直接種真實資料列即可，不需要另做展示用的假來源。
-- 真實玩家之後膜拜機器人也會正常累加，數字是連續的。
--
-- ── 加權方式 ──
-- 依 total_draws 加權（抽得多的人本來就比較容易被膜拜），但權重要壓縮。
-- 第一版用 random() / total_draws 排序，抽最多的人幾乎每次都中，
-- 200 個機器人只有 26 個被膜拜過。改用 Efraimidis-Spirakis 加權抽樣，
-- 權重取 1 + total_draws/100（約 1~10 倍）。
--
-- ── 亂數必須含日期，不能用 random() ──
-- LATERAL 子查詢如果沒引用外層的 d，PostgreSQL 每個膜拜者只會求值一次 ——
-- 結果是「一個人 300 天都膜拜同一個對象」，被膜拜數全是 300 的倍數。
-- 改用 md5(膜拜者, 日期, 對象) 當亂數來源，強制每一天重新選。
-- 順帶好處：結果可重現，重跑不會每次都不一樣。
--
-- 唯一索引是 (worshipper_id, worship_date)：一人一天只能膜拜一次，
-- 所以資料量上限 = 機器人數 × 天數。

DELETE FROM worship_logs w
 USING users u WHERE u.id = w.worshipper_id AND u.is_bot;

INSERT INTO worship_logs (worshipper_id, target_id, worship_date, created_at)
SELECT
  w.id,
  tgt.id,
  (CURRENT_DATE - d),
  (CURRENT_DATE - d)::timestamptz + (random() * interval '20 hours')
FROM (SELECT id, total_draws FROM users WHERE is_bot) w
CROSS JOIN generate_series(0, 299) d
CROSS JOIN LATERAL (
  SELECT t.id FROM users t
  WHERE t.is_bot AND t.id <> w.id
  ORDER BY (
    (('x' || substr(md5(w.id::text || ':' || d::text || ':' || t.id::text), 1, 8))::bit(32)::bigint
      & 2147483647) / 2147483647.0
  ) ^ (1.0 / (1 + COALESCE(t.total_draws, 0) / 100.0)) DESC
  LIMIT 1
) tgt
-- 不是每天都會膜拜：抽得多的人比較活躍，出手也比較頻繁
WHERE (('x' || substr(md5(w.id::text || '#' || d::text), 1, 8))::bit(32)::bigint & 2147483647)
        / 2147483647.0 < LEAST(0.05 + COALESCE(w.total_draws, 0) / 3000.0, 0.45)
ON CONFLICT DO NOTHING;

SELECT count(*) AS 膜拜紀錄, count(DISTINCT target_id) AS 被膜拜過的人 FROM worship_logs;
SELECT min(c) AS 最少, round(avg(c)) AS 平均, round(percentile_cont(0.5) WITHIN GROUP (ORDER BY c)) AS 中位數, max(c) AS 最多
FROM (SELECT target_id, count(*) c FROM worship_logs GROUP BY 1) x;
