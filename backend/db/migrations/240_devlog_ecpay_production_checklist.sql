INSERT INTO dev_logs (version, title, description, type, status, priority, created_at, updated_at)
VALUES (
  '擴展計畫',
  '正式環境切換清單：綠界金流 / 物流',
  '拿到正式 MerchantID / HashKey / HashIV 後，在 Vercel → ggb-backend → Environment Variables 更新以下 6 個變數（前台不需異動）：

• ECPAY_MERCHANT_ID — 正式商家編號（取代測試 3002607）
• ECPAY_HASH_KEY — 正式 HashKey
• ECPAY_HASH_IV — 正式 HashIV
• ECPAY_API_URL — https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5
• ECPAY_LOGISTICS_API_URL — https://logistics.ecpay.com.tw/Express/Create
• ECPAY_LOGISTICS_MAP_URL — https://logistics.ecpay.com.tw/Express/map

金流與物流共用同一組 MerchantID / HashKey / HashIV，無需另設 ECPAY_LOGISTICS_MERCHANT_ID 等。
更新後 Redeploy 後台即生效。',
  'feature',
  'planned',
  'high',
  now(),
  now()
)
ON CONFLICT DO NOTHING;
