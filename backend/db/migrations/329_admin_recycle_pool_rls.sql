-- 329_admin_recycle_pool_rls.sql
-- admin_recycle_pool RLS 修正：prod 開了 RLS 但沒有 policy，導致前台讀不到分解記錄顯示 +0G

-- 確保 RLS 開啟（prod 已開，stg 補上）
ALTER TABLE public.admin_recycle_pool ENABLE ROW LEVEL SECURITY;

-- 使用者只能讀自己的分解記錄
DROP POLICY IF EXISTS "users_read_own_recycle" ON public.admin_recycle_pool;
CREATE POLICY "users_read_own_recycle"
  ON public.admin_recycle_pool
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- service_role 繞過 RLS（Supabase 預設行為，確保後台寫入不受影響）
