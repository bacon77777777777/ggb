-- ============================================================
-- Migration 599: 儲值電子發票欄位（預留，等統編＋綠界發票金鑰）
-- ============================================================
-- 政策：儲值時開票（老闆 2026-08-21）。整合是「開關式」——沒設綠界發票金鑰
-- （ECPAY_INVOICE_MERCHANT_ID 等）時完全不動作，欄位留白；金鑰填上就自動開。
-- 金額＝實付台幣（recharge_records.amount，5% 營業稅內含），贈點不開票。
-- ============================================================

ALTER TABLE public.recharge_records
  ADD COLUMN IF NOT EXISTS invoice_number    text,        -- 綠界回傳的發票號碼
  ADD COLUMN IF NOT EXISTS invoice_status    text NOT NULL DEFAULT 'none',
                                                          -- none(未啟用) / pending(待開) / issued(已開) / failed(開立失敗) / void(作廢)
  ADD COLUMN IF NOT EXISTS invoice_issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS invoice_random    text,        -- 發票隨機碼
  ADD COLUMN IF NOT EXISTS buyer_tax_id      text,        -- 買方統編（B2B 才有，B2C 留空）
  ADD COLUMN IF NOT EXISTS invoice_carrier   text,        -- 載具號碼（手機條碼/自然人憑證）
  ADD COLUMN IF NOT EXISTS invoice_error     text;        -- 開立失敗原因（便於重開）

COMMENT ON COLUMN public.recharge_records.invoice_status IS
  'none=未啟用發票整合 / pending=待開 / issued=已開 / failed=失敗 / void=作廢';
