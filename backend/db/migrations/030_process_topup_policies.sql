BEGIN;

-- Enable RLS on required tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recharge_records ENABLE ROW LEVEL SECURITY;

-- Users: allow each user to read/update only their own row (by id)
DROP POLICY IF EXISTS users_select_own ON public.users;
CREATE POLICY users_select_own ON public.users
FOR SELECT
USING (id = auth.uid());

DROP POLICY IF EXISTS users_update_own ON public.users;
CREATE POLICY users_update_own ON public.users
FOR UPDATE
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Recharge records: allow insert/select only for own records
DROP POLICY IF EXISTS recharge_insert_own ON public.recharge_records;
CREATE POLICY recharge_insert_own ON public.recharge_records
FOR INSERT
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS recharge_select_own ON public.recharge_records;
CREATE POLICY recharge_select_own ON public.recharge_records
FOR SELECT
USING (user_id = auth.uid());

-- Function execution privileges
-- Keep only 'authenticated' role for executing the topup function
DO $$
BEGIN
  -- Revoke from anon if exists; ignore if function not created yet
  BEGIN
    REVOKE EXECUTE ON FUNCTION public.process_topup(NUMERIC, NUMERIC) FROM anon;
  EXCEPTION WHEN undefined_function THEN
    NULL;
  END;
  
  BEGIN
    GRANT EXECUTE ON FUNCTION public.process_topup(NUMERIC, NUMERIC) TO authenticated;
  EXCEPTION WHEN undefined_function THEN
    NULL;
  END;
END $$;

COMMIT;
