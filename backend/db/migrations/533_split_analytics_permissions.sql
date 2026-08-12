-- 533: 拆出「分析頁」「廠商分析」「機台報表」三個獨立權限
--
-- 這三個頁面原本沒有自己的權限勾選，只能跟別人共用：
--
--   /analytics-overview  吃 reports_overview（勾選標籤是「轉換分析」）
--   /analytics-supplier  吃 reports_overview 或 reports_settlement
--   /slot/reports        吃 slot（勾選標籤是「挑戰機台」）
--
-- 結果就是沒辦法「只給分析頁、不給轉換分析」。老闆要拆開，所以新增三個 key。
--
-- ⚠️ 新增 key 之後既有角色不會自動帶有它，不回填的話那些帳號會**立刻看不到**
-- 原本進得去的頁面。所以這裡照舊權限對應補上：
--
--   有 reports_overview                        → 補 analytics_overview
--   有 reports_overview 或 reports_settlement  → 補 analytics_supplier
--   有 slot                                    → 補 slot_reports
--
-- super_admin 不受影響（程式裡直接繞過所有權限檢查）。
-- 目前沒有任何角色帶 slot，所以 slot_reports 這條實際上不會動到資料。

-- 分析頁
UPDATE public.roles
SET permissions = array_append(permissions, 'analytics_overview')
WHERE 'reports_overview' = ANY(permissions)
  AND NOT ('analytics_overview' = ANY(permissions));

-- 廠商分析（營運看報表的人、以及看得到自己結算的廠商都該進得去）
UPDATE public.roles
SET permissions = array_append(permissions, 'analytics_supplier')
WHERE ('reports_overview' = ANY(permissions) OR 'reports_settlement' = ANY(permissions))
  AND NOT ('analytics_supplier' = ANY(permissions));

-- 機台報表
UPDATE public.roles
SET permissions = array_append(permissions, 'slot_reports')
WHERE 'slot' = ANY(permissions)
  AND NOT ('slot_reports' = ANY(permissions));
