-- 628: 保留綠界列印託運單需要的欄位（老闆 2026-08-26 回報「列印物流單怎麼長這樣」）
--
-- 症狀：那顆按鈕只是 `window.print()` —— 把整個後台頁面（含左側選單）印出來，
-- 從來沒有真的去印綠界的託運單。批次列印那顆也一樣。
--
-- 但更根本的問題在資料：`/api/logistics/create` 從綠界拿到
--   AllPayLogisticsID／CVSPaymentNo／CVSValidationNo
-- 三個值，卻**只把其中一個寫進 tracking_number，另外兩個直接丟掉**。
-- 而超商 C2C 的列印 API（PrintUnimartC2CBill 等）三個都要，
-- 所以就算按鈕接對了，也印不出來。
--
-- ⚠️ 既有訂單補不回來：綠界的回應沒有留存，只能重新建立物流單才會拿到。
-- PROD 目前只有 OD2608249803 一筆已建單，重新建一次即可。

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS ecpay_logistics_id text,
  ADD COLUMN IF NOT EXISTS cvs_payment_no     text,
  ADD COLUMN IF NOT EXISTS cvs_validation_no  text;

COMMENT ON COLUMN public.orders.ecpay_logistics_id IS '綠界物流交易編號 AllPayLogisticsID。宅配與 B2C 列印託運單只需要它';
COMMENT ON COLUMN public.orders.cvs_payment_no     IS '超商寄件編號 CVSPaymentNo。C2C 列印託運單必要';
COMMENT ON COLUMN public.orders.cvs_validation_no  IS '超商驗證碼 CVSValidationNo。統一超商 C2C 列印託運單必要';

-- 既有那筆的 tracking_number 是 AllPayLogisticsID（create route 的 fallback 順序是
-- logisticsId || cvsPaymentNo，優先取前者），先回填，至少宅配/B2C 印得出來
UPDATE public.orders
SET    ecpay_logistics_id = tracking_number
WHERE  ecpay_logistics_id IS NULL
  AND  tracking_number IS NOT NULL AND tracking_number <> '';
