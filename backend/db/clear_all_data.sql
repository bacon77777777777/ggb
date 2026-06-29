-- 全站重置腳本 (包含刪除 Auth 帳號與舊備份)
-- 警告：此腳本極度危險，會清空「所有」資料，包含使用者登入帳號與舊系統備份。
-- 請務必在 Supabase Dashboard 的 SQL Editor 中執行此腳本。

BEGIN;

-- 1. 清除交易與紀錄資料 (包含日誌)
TRUNCATE TABLE 
  order_items, 
  orders, 
  draw_records, 
  recharge_records, 
  user_coupons, 
  referrals,
  action_logs,
  shipment_items,
  shipment_requests
RESTART IDENTITY CASCADE;

-- 2. 清除商品與內容資料
TRUNCATE TABLE 
  product_prizes, 
  products, 
  news, 
  banners
RESTART IDENTITY CASCADE;

-- 3. 刪除 舊系統備份資料表 (清理 migration 留下的備份)
DROP TABLE IF EXISTS profiles_backup;
DROP TABLE IF EXISTS prizes_backup;
DROP TABLE IF EXISTS draw_history_backup;
DROP TABLE IF EXISTS user_inventory_backup;

-- 4. 刪除 Auth 使用者 (這會自動觸發 CASCADE 刪除 public.users 中的對應資料)
-- 注意：這需要足夠的權限 (Superuser / Dashboard SQL Editor)
DELETE FROM auth.users;

COMMIT;

-- 5. 檢查結果
SELECT 
  EXISTS (SELECT FROM pg_tables WHERE tablename = 'profiles_backup') as has_backup_table,
  (SELECT COUNT(*) FROM auth.users) as auth_users_count,
  (SELECT COUNT(*) FROM public.users) as public_users_count,
  (SELECT COUNT(*) FROM products) as products_count;
