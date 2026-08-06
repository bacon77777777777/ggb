-- 496: 機台（slot）納入功能開關的「類別」區
--
-- 機台原本刻意不受開關管轄（lib/categoryFlags.ts 註解寫「永遠開著」），
-- 但其他五個類別都能開放／維護／關閉，只有機台不行，後台看起來像漏了一個。
--
-- 預設 'on'：這支 migration 只是把開關做出來，不改變任何現有行為。

INSERT INTO feature_flags (key, enabled, state)
VALUES ('slot', TRUE, 'on')
ON CONFLICT (key) DO NOTHING;
