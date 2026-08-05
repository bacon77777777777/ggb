-- 474: 標記平台自營的廠商
--
-- 老闆：「csv 模組，機台跟模組裡的機台範例隱藏，只有超級管理員跟吉吉比看得到。」
--
-- 機台（slot）是平台自營的玩法，不是外部廠商供貨的品類。
-- 外部廠商拿到機台範本只會困惑，填了也不該上架。
--
-- 用旗標而不是把「吉吉比」的 id 寫死：公司名可能改、id 在兩個環境也不保證一樣，
-- 而且之後若有第二家自營單位，加一個旗標就好。
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS is_platform BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN suppliers.is_platform IS
  '平台自營廠商。可以使用機台（slot）等平台專屬品類，外部廠商不行。';

UPDATE suppliers SET is_platform = TRUE WHERE name = '吉吉比';

SELECT id, name, is_platform AS 平台自營 FROM suppliers ORDER BY id;
