-- 446: 落選籤的顯示文案改成「落選，感謝參與」
--
-- 原本寫「銘謝惠顧」。抽獎結果畫面直接吃 product_prizes.name，
-- 所以改這裡就等於改了結果畫面、抽獎紀錄、驗證頁三個地方的顯示，
-- 不用在前端各加一個字串對照。
--
-- level 維持 '未中獎' 不動 —— play_lottery 與 ensure_lottery_blank_prize
-- 都是用它當判斷依據，改了會直接讓落選被當成中籤。

CREATE OR REPLACE FUNCTION public.ensure_lottery_blank_prize(p_product_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_total  INTEGER;
  v_wins   INTEGER;
  v_blanks INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM product_ticket_seals WHERE product_id = p_product_id) THEN
    RETURN;   -- 已封存，籤已排定，落選籤不可再變動
  END IF;

  SELECT lottery_total_draws INTO v_total
  FROM products WHERE id = p_product_id AND sale_mode = 'lottery';
  IF v_total IS NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(total), 0) INTO v_wins
  FROM product_prizes WHERE product_id = p_product_id AND level <> '未中獎';

  v_blanks := v_total - v_wins;
  IF v_blanks < 0 THEN
    RAISE EXCEPTION 'LOTTERY_OVERSUBSCRIBED: 獎項共 % 個，超過總抽獎次數 %', v_wins, v_total;
  END IF;

  DELETE FROM product_prizes WHERE product_id = p_product_id AND level = '未中獎';

  IF v_blanks > 0 THEN
    INSERT INTO product_prizes (product_id, level, name, total, remaining, probability, sale_price)
    VALUES (p_product_id, '未中獎', '落選，感謝參與', v_blanks, v_blanks, 0, 0);
  END IF;
END;
$$;

UPDATE public.product_prizes SET name = '落選，感謝參與'
 WHERE level = '未中獎' AND name = '銘謝惠顧';
UPDATE public.draw_records SET prize_name = '落選，感謝參與'
 WHERE prize_level = '未中獎' AND prize_name = '銘謝惠顧';
