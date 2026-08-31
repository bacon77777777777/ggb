-- 656_lottery_feature_flag.sql
--
-- 抽籤販售納入「功能開關」的類別開關（老闆 2026-08-31：要能開、關、維護）。
--
-- 跟其他六個類別（ichiban／blindbox／gacha／card／custom／slot）同一套語意：
--   on           正常開放
--   maintenance  照常列出，但登記按鈕停用（玩家看得到它還在，只是暫時停一下）
--   off          從前台完全消失（列表頁與首頁入口一起收起來）
--
-- ⚠️ 這跟「抽籤販售設定」裡的 lottery_list_enabled 不同層：
--   feature_flags.lottery  —— 站台層級的三態開關，跟其他類別放在同一頁一起看
--   lottery_list_enabled   —— 抽籤自己的設定頁的總開關
-- 兩者都關才是關；只要其中一個是 off／關閉，前台就不顯示。保留兩個是因為
-- 前者是「營運要跟其他類別一起管」，後者是「這個功能自己的開關」，
-- 出事時第一個被找的是功能開關頁，不會有人記得還有第二個地方。

BEGIN;

INSERT INTO feature_flags (key, state)
VALUES ('lottery', 'on')
ON CONFLICT (key) DO NOTHING;

COMMIT;
