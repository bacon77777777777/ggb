-- W2-2: ECPay 付款對帳 cron（每 3 小時）
SELECT cron.schedule(
  'ecpay-reconcile',
  '0 */3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://admin.ggb.com.tw/api/cron/reconcile-payments',
    headers := '{"x-cron-secret":"6284ae7714d2c6d23124438c10c36f6f2bc297421c02fcfc35942c4285edd1f7"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);
