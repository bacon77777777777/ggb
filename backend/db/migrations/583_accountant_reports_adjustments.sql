-- 583_accountant_reports_adjustments.sql
-- 新頁「手動調整明細」（/reports/adjustments，權限 key reports_adjustments）掛給會計角色。
BEGIN;
UPDATE public.roles
SET permissions = array_append(permissions, 'reports_adjustments'),
    updated_at = now()
WHERE name = 'accountant'
  AND NOT ('reports_adjustments' = ANY(permissions));
COMMIT;
