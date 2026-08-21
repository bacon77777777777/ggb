-- ============================================================
-- Migration 598: 敏感表 RLS 狀態檢查函數（後台系統健康燈用）
-- ============================================================
-- 後台 dashboard 的「系統健康」燈與 health-check cron 都呼叫這支，
-- 一次回報所有敏感表的 RLS 開關狀態。系統表（pg_class）用 supabase-js
-- 的 .from() 撈不到，所以包成 SECURITY DEFINER 函數由 service_role 呼叫。
-- ============================================================

CREATE OR REPLACE FUNCTION public.sensitive_tables_rls_status()
RETURNS TABLE(table_name text, rls_enabled boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
  SELECT c.relname::text, c.relrowsecurity
  FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace
    AND c.relkind = 'r'
    AND c.relname = ANY (ARRAY[
      'users','recharge_records','draw_records','token_adjustments',
      'orders','order_items','user_coupons','daily_check_ins',
      'sell_orders','line_login_tickets','notifications'
    ])
  ORDER BY 1;
$$;

REVOKE ALL ON FUNCTION public.sensitive_tables_rls_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sensitive_tables_rls_status() TO service_role;
