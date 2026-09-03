-- 翻牌數字改成「換算台幣、保留兩位小數、不設門檻」（老闆 2026-09-03）：
-- 原本 integer 存「日圓 × 0.22 取 5 的倍數」，30～80 円的普卡都被 <100 的門檻擋掉。
-- 改成 numeric(12,2) 存「日圓 × 當日匯率」的台幣，前台原樣顯示到小數兩位，每張都跳。
ALTER TABLE product_prizes ALTER COLUMN market_display_value TYPE numeric(12,2);
COMMENT ON COLUMN product_prizes.market_display_value IS '翻牌時跳的「+N」體感數字：日圓標價 × 當日 JPY→TWD 匯率的台幣，小數兩位；由 card-price-daily 更新，NULL 不跳';
ALTER TABLE card_market_prices ALTER COLUMN display_value TYPE numeric(12,2);
