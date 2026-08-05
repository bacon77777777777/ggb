-- 443: 抽籤販售上架時無限遞迴
--
--   trg_auto_seal_on_prizes（product_prizes 寫入）
--     → try_auto_seal
--       → ensure_lottery_blank_prize
--         → INSERT product_prizes（補「未中獎」那一列）
--           → trg_auto_seal_on_prizes ...
--
-- 直接 stack depth limit exceeded，商品根本存不起來。
--
-- 「未中獎」那一列是封存流程自己補出來的，不是管理員設的賞項，
-- 所以它的寫入不該再去觸發一次封存判斷。

CREATE OR REPLACE FUNCTION public.auto_seal_on_prizes_ready()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- 補落選籤這件事本身就發生在封存流程裡，不能再回頭觸發封存
  IF NEW.level = '未中獎' THEN
    RETURN NULL;
  END IF;

  PERFORM public.try_auto_seal(NEW.product_id);
  RETURN NULL;   -- AFTER trigger，回傳值不影響結果
END $$;

-- 同理：ensure_lottery_blank_prize 會先 DELETE 舊的未中獎列再重建，
-- 而封存後的 guard 會擋 product_prizes 的異動。封存後本來就不該再重算落選籤，
-- 所以這裡明確擋掉，錯誤訊息才指得到真正的原因。
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
    VALUES (p_product_id, '未中獎', '銘謝惠顧', v_blanks, v_blanks, 0, 0);
  END IF;
END;
$$;
