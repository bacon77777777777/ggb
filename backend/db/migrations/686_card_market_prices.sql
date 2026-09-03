-- 抽卡翻牌的「+10,000」體感數字（老闆 2026-09-03）：第三方行情（遊々亭日圓標價）換算的參考值，
-- 不是回收價。每天一支 cron 抓價寫歷史，最新顯示值快取到品項上給前台直接讀。
--
-- 對應外站靠「系列代號＋卡號」：商品層填系列代號（遊々亭的 vers 代碼，例如 sv10、m02），
-- 品項層的卡號從名稱前綴（例如「003 超級噴火龍Xex」）自動抓。

ALTER TABLE products ADD COLUMN IF NOT EXISTS card_set text;
COMMENT ON COLUMN products.card_set IS '抽卡商品對應的外站系列代號（遊々亭 vers 代碼，如 sv10、m02）；沒填就不抓市價';

ALTER TABLE product_prizes ADD COLUMN IF NOT EXISTS card_no text;
COMMENT ON COLUMN product_prizes.card_no IS '卡號（3 位數，如 003），從品項名稱前綴自動抓，對應外站用';
ALTER TABLE product_prizes ADD COLUMN IF NOT EXISTS market_display_value integer;
COMMENT ON COLUMN product_prizes.market_display_value IS '翻牌時跳的「+N」體感數字（日圓標價 × 0.22 取 5 的倍數），由 card-price-daily cron 更新；NULL 或 <100 不跳';

CREATE TABLE IF NOT EXISTS card_market_prices (
  id            bigserial PRIMARY KEY,
  prize_id      bigint NOT NULL REFERENCES product_prizes(id) ON DELETE CASCADE,
  source        text   NOT NULL DEFAULT 'yuyu-tei',
  card_set      text   NOT NULL,
  card_no       text   NOT NULL,
  jpy           integer NOT NULL,
  fx_jpy_twd    numeric(10,6),
  twd           integer,
  display_value integer NOT NULL,
  fetched_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS card_market_prices_prize_fetched_idx ON card_market_prices (prize_id, fetched_at DESC);
COMMENT ON TABLE card_market_prices IS '抽卡品項每日市價歷史（遊々亭日圓標價 → 匯率 → 台幣 → 顯示值）';

ALTER TABLE card_market_prices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role full access on card_market_prices" ON card_market_prices;
CREATE POLICY "service role full access on card_market_prices" ON card_market_prices FOR ALL USING (auth.role() = 'service_role');
-- 前台不直接讀這張表（讀品項上的快取欄），anon／authenticated 不給

-- 既有抽卡品項：卡號從名稱前綴回填
UPDATE product_prizes pp
SET card_no = substring(pp.name from '^(\d{3})')
FROM products p
WHERE p.id = pp.product_id AND p.type = 'card' AND pp.card_no IS NULL AND pp.name ~ '^\d{3}';
