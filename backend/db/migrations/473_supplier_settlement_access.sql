-- 473: 廠商可以看自己的結算頁
--
-- 472 把廠商權限收成只有 {products}。老闆補充：廠商也要看得到廠商結算，
-- 但只能看自己那家的數字。
--
-- 結算頁本身沒有任何玩家欄位（純廠商層級的金額彙總），所以不牴觸
-- 「不該讓廠商看到會員」。但它原本會從 /api/admin/suppliers 抓全部廠商
-- 給人下拉切換 —— 直接開權限的話，廠商就看得到別家的結算金額。
--
-- 所以權限與限縮必須一起上（本檔只管權限，限縮在程式端）：
--   /api/admin/suppliers  廠商只拿得到自己那一家 → 下拉只有一個選項
--   /api/admin/reports    不管網址帶什麼 supplierId，一律蓋成 session 的那家
--                         （只靠前端下拉不夠，網址參數改一下就繞過去了）

UPDATE roles
SET permissions = ARRAY['products', 'reports_settlement'],
    description = '只能看到並編輯自己供貨的商品，以及自己的廠商結算。'
                  || '不能刪除商品、不能看公平性驗證，也看不到會員與其他廠商的資料。',
    updated_at  = now()
WHERE name = 'supplier';

SELECT name AS 角色, array_to_string(permissions, ',') AS 權限 FROM roles WHERE name='supplier';
