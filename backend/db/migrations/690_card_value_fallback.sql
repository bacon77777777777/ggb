-- 沒有行情來源的抽卡品項也要跳「+N」（老闆 2026-09-03：未來抽卡商品上架都要有行情且跳）。
-- 三檔「戰術牌組」遊々亭沒有牌組單卡系列，對不到；照賞等給體感值，來源標 'grade-fallback'。
-- 數字照 staging 示範值那組（A/SSR/最後賞 26,000、B/SR 8,800、C/R 1,500、其他 350），
-- 再用名稱雜湊給 ±15% 的抖動，同賞等的卡不會全部同一個數字。
CREATE OR REPLACE FUNCTION card_value_fallback(p_grade text, p_name text) RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$
  SELECT round((
    CASE
      WHEN upper(coalesce(p_grade,'')) ~ '(SSR|A賞|超稀有|最後賞|LAST ONE)' THEN 26000
      WHEN upper(coalesce(p_grade,'')) ~ '(SR|B賞)' THEN 8800
      WHEN upper(coalesce(p_grade,'')) ~ '(R|C賞|稀有)' THEN 1500
      ELSE 350
    END
  ) * (0.85 + (abs(hashtext(coalesce(p_name,''))) % 31) / 100.0), 2);
$$;

/** 把還沒有值的抽卡品項補上體感值，並記一筆歷史（source = grade-fallback）。回傳補了幾筆。 */
CREATE OR REPLACE FUNCTION apply_card_value_fallback() RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  WITH todo AS (
    SELECT pp.id, pp.level, pp.name, coalesce(p.card_set, '') AS card_set, coalesce(pp.card_no, '') AS card_no
    FROM product_prizes pp JOIN products p ON p.id = pp.product_id
    WHERE p.type = 'card' AND pp.market_display_value IS NULL
  ), upd AS (
    UPDATE product_prizes pp SET market_display_value = card_value_fallback(t.level, t.name)
    FROM todo t WHERE pp.id = t.id RETURNING pp.id, pp.market_display_value, t.card_set, t.card_no
  )
  INSERT INTO card_market_prices (prize_id, source, card_set, card_no, jpy, fx_jpy_twd, twd, display_value)
  SELECT id, 'grade-fallback', card_set, card_no, 0, NULL, NULL, market_display_value FROM upd;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

SELECT apply_card_value_fallback() AS filled;
