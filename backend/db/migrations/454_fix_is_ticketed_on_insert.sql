-- 454: 451 的唯一索引對新抽獎完全沒作用
--
-- 451 做了三件事：加 is_ticketed 欄位、回填既有資料、建 partial unique index
--   CREATE UNIQUE INDEX ... WHERE is_ticketed AND ticket_number IS NOT NULL
--
-- 但**沒有讓任何抽獎函數在新紀錄上設 is_ticketed**。
-- 欄位 DEFAULT FALSE，play_ichiban 的 INSERT 又沒列到它，
-- 所以每一筆新抽獎都是 false，索引的述詞永遠不成立 —— 索引形同虛設。
--
-- PROD 壓測跑出 4212 筆抽獎，is_ticketed 全部是 false，就是這樣被發現的。
--
-- 目前正確性沒有破，是因為 453 把商品鎖改成「等待」而不是拿掉：
-- check-then-insert 仍然被序列化，只有一個交易在臨界區內。
-- 但我當初的說法是「索引接手正確性、鎖只負責排順序」—— 那是錯的，
-- 索引根本沒生效。這一版把它補起來，讓兩層防護都真的存在。
--
-- 用 trigger 而不是改函數：抽獎有四支函數、未來還會有更多，
-- 每支都要記得設一個旗標遲早會再漏一次。判斷條件只跟商品類型有關，
-- 放在資料表這一層才是對的位置。

CREATE OR REPLACE FUNCTION public.set_draw_is_ticketed()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- 一番賞／抽卡／自製賞的 ticket_number 是真的籤號；
  -- 轉蛋只是 nonce（同商品會重複），機台是 NULL
  SELECT p.type IN ('ichiban', 'card', 'custom')
    INTO NEW.is_ticketed
  FROM products p WHERE p.id = NEW.product_id;

  NEW.is_ticketed := COALESCE(NEW.is_ticketed, FALSE);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_draw_is_ticketed ON public.draw_records;
CREATE TRIGGER trg_set_draw_is_ticketed
  BEFORE INSERT ON public.draw_records
  FOR EACH ROW EXECUTE FUNCTION public.set_draw_is_ticketed();

COMMENT ON FUNCTION public.set_draw_is_ticketed IS
  '依商品類型標記 ticket_number 是否為真籤號，供 uq_draw_records_ticket 唯一索引判定。';

-- 回填 451 之後、本 migration 之前寫入的紀錄
UPDATE public.draw_records d SET is_ticketed = TRUE
  FROM public.products p
 WHERE p.id = d.product_id AND p.type IN ('ichiban','card','custom') AND NOT d.is_ticketed;
