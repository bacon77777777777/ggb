-- 廠商寄件資訊（綠界物流必填）
ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS sender_name    text,        -- 寄件人姓名（2-5中文字，ECPay限制）
  ADD COLUMN IF NOT EXISTS sender_zip_code text,       -- 郵遞區號
  ADD COLUMN IF NOT EXISTS sender_address  text;       -- 寄件地址（空時 fallback 到 address）
