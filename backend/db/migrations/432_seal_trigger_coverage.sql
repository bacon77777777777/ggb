-- 432: 補上自動封存漏掉的路徑
--
-- 429 的 trigger 綁 `UPDATE OF is_active`，漏掉一種很常見的建檔順序：
-- 先把商品建成上架狀態、之後才補賞項。那時 is_active 不會再被改一次，
-- trigger 不會觸發，商品就永遠沒有封存表 —— 而 play_ichiban 會安靜地退回
-- 舊路徑照常出獎，沒有任何錯誤，只是那一檔不可驗證。
--
-- 改成任何一次 products 的寫入都檢查一遍。條件第一關是 seal 是否已存在
-- （主鍵查詢），已封存的商品直接短路，不會有額外負擔。

DROP TRIGGER IF EXISTS trg_auto_seal_on_publish ON public.products;
CREATE TRIGGER trg_auto_seal_on_publish
  AFTER INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.auto_seal_on_publish();

-- 手動封存：給後台按鈕用。條件與自動封存相同，只是由管理員決定時機
CREATE OR REPLACE FUNCTION public.seal_product_now(p_product_id BIGINT, p_by TEXT DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_type TEXT;
BEGIN
  SELECT type INTO v_type FROM products WHERE id = p_product_id;
  IF v_type IS NULL THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;
  IF v_type NOT IN ('ichiban', 'card', 'custom') THEN
    RAISE EXCEPTION 'TYPE_NOT_APPLICABLE: 只有一番賞／抽卡／自製賞需要排籤';
  END IF;
  IF EXISTS (SELECT 1 FROM product_ticket_seals WHERE product_id = p_product_id) THEN
    RAISE EXCEPTION 'ALREADY_SEALED';
  END IF;
  RETURN public.seal_product_tickets(p_product_id, NULL, COALESCE(p_by, 'manual'));
END;
$$;

COMMENT ON FUNCTION public.seal_product_now IS
  '後台手動排籤封存。已封存或已開賣者拒絕。';
