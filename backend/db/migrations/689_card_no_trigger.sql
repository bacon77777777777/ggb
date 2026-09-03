-- 卡號自動從品項名稱抓（老闆 2026-09-03：風暴翡翠沒對到，要補卡號）
-- 兩種格式都認：前綴「003 超級噴火龍Xex」、後綴「超級烈空坐ex 113/076」。
-- 做成 BEFORE INSERT/UPDATE 觸發器，新匯入、改名都自動有，不用每次手動回填。
CREATE OR REPLACE FUNCTION extract_card_no(p_name text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(
    substring(p_name from '^\s*(\d{3})\s'),
    substring(p_name from '(\d{3})/\d{3}')
  );
$$;

CREATE OR REPLACE FUNCTION set_prize_card_no() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.card_no IS NULL OR NEW.card_no = '' THEN
    NEW.card_no := extract_card_no(NEW.name);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_prize_card_no ON product_prizes;
CREATE TRIGGER trg_prize_card_no BEFORE INSERT OR UPDATE OF name ON product_prizes
  FOR EACH ROW EXECUTE FUNCTION set_prize_card_no();

-- 既有品項回填（含後綴格式）
UPDATE product_prizes SET card_no = extract_card_no(name)
WHERE (card_no IS NULL OR card_no = '') AND extract_card_no(name) IS NOT NULL;
