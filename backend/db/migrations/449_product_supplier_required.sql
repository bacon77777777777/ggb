-- 449: 商品必須指定廠商
--
-- 前台倉庫是「以廠商為單位分批出貨，每次申請限同一廠商品項」，
-- 所以沒有廠商的商品在倉庫會顯示「未知廠商」，而且分不進任何一批出貨。
--
-- 新增頁本來就擋，但編輯頁沒擋（可以把既有商品改回「未指定」），
-- 直接寫 DB 的路徑更是完全沒防護 —— 這三檔抽籤販售商品就是我用 SQL
-- 直接塞才漏掉的。表單那層已補，這裡再加一道，任何路徑都躲不掉。
--
-- 用 NOT VALID：現有資料不回頭檢查（PROD 還有 2 筆早期測試商品沒填），
-- 但之後的 INSERT 與 UPDATE 都會被擋。那 2 筆一旦有人編輯就必須補上廠商，
-- 不會累積新的缺漏，也不會為了加約束去動線上資料。

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_supplier_required_chk;
ALTER TABLE public.products ADD CONSTRAINT products_supplier_required_chk
  CHECK (supplier_id IS NOT NULL) NOT VALID;

COMMENT ON CONSTRAINT products_supplier_required_chk ON public.products IS
  '商品必須指定廠商（出貨以廠商分批）。NOT VALID：既有缺漏不擋，新寫入與更新都擋。';
