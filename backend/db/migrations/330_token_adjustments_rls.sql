-- 330_token_adjustments_rls.sql
-- token_adjustments RLS 修正：prod 開了 RLS 但沒有 policy
-- 影響：token_ledger VIEW 的 manual 類型前台讀不到（CFO 對帳顯示缺少手動補幣）

-- 使用者只能讀自己的調整記錄
ALTER TABLE public.token_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_adjustments" ON public.token_adjustments;
CREATE POLICY "users_read_own_adjustments"
  ON public.token_adjustments
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- service_role 繞過 RLS（Supabase 預設，確保後台 GB哥 寫入不受影響）
