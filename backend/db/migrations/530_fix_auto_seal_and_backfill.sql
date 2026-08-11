-- 530: 修好自動封存的觸發條件，並補跑現有商品的排籤封存
--
-- `try_auto_seal` 的條件寫 `is_active`，但商品上架實際用的是 `status='active'`。
-- products 兩個欄位都有，`is_active` 沒有任何程式在維護（12 個上架商品全是
-- false），所以自動封存**從來沒有觸發過** —— product_ticket_seals 是 0 筆。
--
-- 後果有兩個：
--   1. 抽獎走舊的即時機率路徑，不是封存查表
--   2. 玩家的公平性驗證頁沒有承諾值可比對，點進去是空的
--
-- 老闆決定殺率全部維持 100%（不殺），所以直接補跑封存。
-- 100% 的意思是「大獎可以出現在任何一張籤」—— 保護區長度為 0。

CREATE OR REPLACE FUNCTION public.try_auto_seal(p_product_id bigint)
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
  IF EXISTS (
        SELECT 1 FROM products
         WHERE id = p_product_id
           AND type IN ('ichiban', 'card', 'custom')
           -- 上架與否看 status。is_active 是沒人維護的舊欄位，
           -- 判它等於這個 trigger 永遠不會做事
           AND status = 'active'
     )
     AND NOT EXISTS (SELECT 1 FROM product_ticket_seals WHERE product_id = p_product_id)
     AND NOT EXISTS (SELECT 1 FROM draw_records WHERE product_id = p_product_id)
     AND EXISTS (SELECT 1 FROM product_prizes WHERE product_id = p_product_id AND total > 0)
  THEN
    -- 抽籤販售要先把落選籤補齊再排
    PERFORM public.ensure_lottery_blank_prize(p_product_id);
    PERFORM public.seal_product_tickets(p_product_id, NULL, 'auto:publish');
  END IF;
END $function$;

-- 補跑：已上架、還沒封存、也還沒被抽過的商品
DO $$
DECLARE r RECORD; v_ok INT := 0; v_skip INT := 0;
BEGIN
  FOR r IN
    SELECT id, name FROM products
    WHERE type IN ('ichiban', 'card', 'custom') AND status = 'active'
    ORDER BY id
  LOOP
    BEGIN
      PERFORM public.try_auto_seal(r.id);
      IF EXISTS (SELECT 1 FROM product_ticket_seals WHERE product_id = r.id) THEN
        v_ok := v_ok + 1;
      ELSE
        v_skip := v_skip + 1;
        RAISE NOTICE '跳過 % (%)：已有抽獎紀錄或沒有品項', r.name, r.id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_skip := v_skip + 1;
      RAISE NOTICE '跳過 % (%)：%', r.name, r.id, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE '封存完成 % 筆，跳過 % 筆', v_ok, v_skip;
END $$;

SELECT p.type, p.id, left(p.name, 26) AS name,
       p.profit_rate,
       (s.product_id IS NOT NULL) AS 已封存,
       array_length(s.assignment, 1) AS 籤數
FROM products p
LEFT JOIN product_ticket_seals s ON s.product_id = p.id
WHERE p.type IN ('ichiban', 'card', 'custom') AND p.status = 'active'
ORDER BY p.type, p.id;
