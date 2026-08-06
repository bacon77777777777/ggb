-- 482：類別關閉時擋掉抽獎
--
-- 後台把「轉蛋」之類的類別關掉之後，前台只是不顯示分類頁籤而已，
-- 商品頁本身沒有任何防護 —— 手上有連結（書籤、分享出去的網址、Google 快照）
-- 的人照樣進得去，也照樣抽得到。
--
-- 為什麼擋在 draw_records 的 trigger 而不是各個 play_* 函數裡：
-- TicketSelectionFlow 是從瀏覽器直接呼叫 play_ichiban_locked 的（不經過 API route），
-- 所以任何只寫在 Next.js 那一層的檢查都繞得過去。而每一條抽獎路徑
-- （play_gacha_locked / play_ichiban_locked / play_ichiban_auto_locked /
-- play_lottery / play_slot_locked）最後都會寫進 draw_records，
-- 擋在這裡等於一次蓋掉全部，也不用動那五個核心函數。
--
-- 只擋 INSERT。拆解是把既有那筆的 status 改成 dismantled，不新增資料列，
-- 所以類別關掉之後玩家還是拆得動已經抽到的獎品 —— 這是刻意的：
-- 關類別是「不再賣」，不是「沒收玩家已經有的東西」。

CREATE OR REPLACE FUNCTION public.assert_category_enabled()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_type    text;
  v_enabled boolean;
BEGIN
  SELECT type INTO v_type FROM products WHERE id = NEW.product_id;
  IF v_type IS NULL THEN
    RETURN NEW;
  END IF;

  -- products.type 跟 feature_flags.key 同名（gacha / ichiban / blindbox / card / custom）。
  -- 查不到旗標就放行 —— slot 就沒有對應的旗標，機台永遠開著
  SELECT enabled INTO v_enabled FROM feature_flags WHERE key = v_type;

  IF v_enabled IS NOT NULL AND v_enabled = false THEN
    -- 這句話會原封不動出現在玩家的畫面上，不要寫類別代號或欄位名
    RAISE EXCEPTION '這個類別暫時關閉了，晚點再來看看';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assert_category_enabled ON public.draw_records;
CREATE TRIGGER trg_assert_category_enabled
  BEFORE INSERT ON public.draw_records
  FOR EACH ROW EXECUTE FUNCTION public.assert_category_enabled();
