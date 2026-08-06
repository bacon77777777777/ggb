-- 486：settings_theme 權限
--
-- 新增後台頁面要同步補權限，否則除了超級管理員以外沒有人進得去 ——
-- middleware 與側邊欄的預設都是 fail closed，查不到對應權限就擋。
--
-- 權限存在 roles.permissions（不是 admins），super_admin 是 {all} 走特例，
-- 所以不需要也不該把它展開成一長串。
--
-- 給誰：原本就有 settings 或 settings_features 的角色 —— 那兩個代表
-- 「可以改平台設定」，主題色是同一類的東西。目前沒有角色符合，
-- 這段等於是預留：之後有人被授予 settings 時，這條規則已經寫在歷史裡了。

UPDATE public.roles
   SET permissions = array_append(permissions, 'settings_theme'),
       updated_at  = NOW()
 WHERE NOT ('settings_theme' = ANY(COALESCE(permissions, ARRAY[]::text[])))
   AND (
     'settings'          = ANY(COALESCE(permissions, ARRAY[]::text[]))
     OR 'settings_features' = ANY(COALESCE(permissions, ARRAY[]::text[]))
   );
