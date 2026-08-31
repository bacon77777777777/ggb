-- 664: 把「回收商品管理」從 recycle_pool 拆成獨立權限，並開放給廠商角色
--
-- 為什麼一定要拆：recycle_pool 同時管兩頁 ——
--   /dismantled          回收紀錄     有玩家暱稱、會員編號、UUID
--   /recycle-inventory   回收商品管理 只有商品與件數
-- 直接把 recycle_pool 給廠商，他會連玩家名單一起看到。

-- 原本看得到的角色維持看得到
UPDATE public.roles
SET permissions = array_append(permissions, 'recycle_inventory')
WHERE 'recycle_pool' = ANY(permissions)
  AND NOT ('recycle_inventory' = ANY(permissions));

-- 廠商：只給新的那個，看自己的回收品（API 依 admins.supplier_id 收斂）
UPDATE public.roles
SET permissions = array_append(permissions, 'recycle_inventory')
WHERE name = 'supplier'
  AND NOT ('recycle_inventory' = ANY(permissions));
