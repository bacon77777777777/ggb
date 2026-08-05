-- 469: 兩環境的角色定義收斂成同一份
--
-- 468 套用時發現兩邊差很多：
--
--   PROD  admin/operator/marketing/logistics 的權限字串是舊詞彙
--         （dashboard_view、products_manage…），但 lib/permissionPaths.ts
--         比對的是新詞彙（dashboard、products…）—— 一個都對不上。
--         也就是說**現在在 PROD 建一個一般管理員帳號，他登入就會被踢到 /no-access**。
--         目前沒人踩到只是因為 PROD 只有兩個 super_admin 加一個 accountant。
--
--   STG   完全沒有 supplier 與 accountant 兩個角色。
--
-- 權限字串必須跟 lib/permissionPaths.ts 的 PATH_PERMISSIONS 一致，
-- 那份清單是 middleware 判斷「這個路徑要什麼權限」的依據。
-- 詞彙對不上不會報錯，只會安靜地把人擋在門外 —— 這種錯最難查。
--
-- id 沿用 PROD 現有的（supplier=16、accountant=17），避免動到既有的 role_id 參照。

INSERT INTO roles (id, name, display_name, description, permissions) VALUES
  (1,  'super_admin', '超級管理員', '擁有系統所有權限',
       ARRAY['all']),
  (2,  'admin',       '管理員',     '一般管理權限，無法管理其他管理員',
       ARRAY['dashboard','products','orders','users','draws','recharges']),
  (3,  'operator',    '營運人員',   '負責日常營運與訂單處理',
       ARRAY['dashboard','orders','draws']),
  (4,  'marketing',   '行銷人員',   '負責行銷活動與數據查看',
       ARRAY['dashboard','products']),
  (5,  'logistics',   '物流人員',   '負責出貨與配送管理',
       ARRAY['orders']),
  (16, 'supplier',    '廠商',       '僅能管理自己供貨的商品、查看含自有商品的訂單與進銷存。看不到全站營運與財務資料。',
       ARRAY['products','orders','reports_products']),
  (17, 'accountant',  '會計',       '對帳與報表',
       ARRAY['recharges','reports_logistics','reports_products','reports_dismantled','reports_settlement'])
ON CONFLICT (id) DO UPDATE SET
  name         = EXCLUDED.name,
  display_name = EXCLUDED.display_name,
  description  = EXCLUDED.description,
  permissions  = EXCLUDED.permissions,
  updated_at   = now();

-- 明確指定 id 之後序列會落後，下次新增角色就會撞主鍵
SELECT setval(
  pg_get_serial_sequence('roles', 'id'),
  GREATEST((SELECT MAX(id) FROM roles), 1)
);

SELECT id, name, array_to_string(permissions, ',') AS 權限 FROM roles ORDER BY id;
