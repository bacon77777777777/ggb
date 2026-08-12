-- 536: 營運總覽收成三頁 —— 合併 reports_overview / reports_behavior 到 analytics_overview
--
-- 「轉換分析」(/reports/overview) 與「點擊分析」(/reports/behavior) 的指標已經併進
-- 「數據分析」(/analytics-overview) 這一頁，選單上不再有這兩個入口。
-- 兩支路由本身留著（同一個 /reports/[type] 還在服務對帳報表的消費明細），
-- 只是權限改跟著 analytics_overview 走。
--
-- ⚠️ 順序很重要：**先回填、再移除**。
-- 直接把兩個 key 拿掉的話，只有 reports_overview 沒有 analytics_overview 的角色
-- 隔天登入就會發現原本看得到的數據全不見了 —— 533 那次拆權限就是靠回填才沒出事。
--
-- super_admin 不受影響（程式裡直接繞過所有權限檢查）。

-- ① 回填：看得到轉換分析或點擊分析的角色，一律補上數據分析
UPDATE public.roles
SET permissions = array_append(permissions, 'analytics_overview')
WHERE ('reports_overview' = ANY(permissions) OR 'reports_behavior' = ANY(permissions))
  AND NOT ('analytics_overview' = ANY(permissions));

-- ② 移除已停用的兩個 key，權限頁上不再列出它們，留著只會讓人以為還有那兩頁
UPDATE public.roles
SET permissions = array_remove(array_remove(permissions, 'reports_overview'), 'reports_behavior')
WHERE 'reports_overview' = ANY(permissions) OR 'reports_behavior' = ANY(permissions);
