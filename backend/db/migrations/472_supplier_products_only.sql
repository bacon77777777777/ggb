-- 472: 廠商角色只留商品管理
--
-- 468 給廠商的是 {products, orders, reports_products}。老闆看過之後定案更窄：
-- 「廠商帳號只需要看到他自己的商品的商品管理列表，且操作只有編輯，
--   不得刪除跟驗證」「不該讓廠商看到會員」。
--
-- 拿掉的兩項各有具體理由：
--   orders            配送管理會顯示玩家的姓名、電話、收件地址 —— 那是會員資料
--   reports_products  消費明細逐筆列出是誰買的，同樣會露出會員
--
-- 進銷存不另開頁面：商品管理列表本來就有庫存（remaining）與銷量（sales），
-- 廠商要的資訊在那裡看得到，而且不會連帶露出玩家。
--
-- 公平性驗證頁（/products/[id]/verify）也不給 —— 那是平台對玩家的承諾，
-- 讓供貨方看得到封存內容等於把驗證的意義抵銷掉。
-- 頁面層在 middleware 擋、API 層在 SUPPLIER_API_DENY_SUFFIX 擋。

UPDATE roles
SET permissions = ARRAY['products'],
    description = '只能看到並編輯自己供貨的商品。不能刪除、不能看公平性驗證，也看不到會員與任何全站營運/財務資料。',
    updated_at  = now()
WHERE name = 'supplier';

SELECT name AS 角色, array_to_string(permissions, ',') AS 權限, description AS 說明 FROM roles WHERE name='supplier';
