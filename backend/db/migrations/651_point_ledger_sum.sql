-- 651_point_ledger_sum.sql
--
-- 後台會員詳情的「積分流動」頁籤要顯示一個健檢：帳本加總是否等於餘額。
-- 對不上＝有人繞過 grant_points/spend_points 直接改了 users.points，那要立刻查。
--
-- 為什麼不用 PostgREST 的 `select('delta.sum()')`：聚合函數要專案有開
-- `db-aggregates-enabled`，不是每個 Supabase 專案都預設開著，關著的時候是回錯誤
-- 而不是回 0 —— 一個只為了健檢的欄位不該讓整頁掛掉。撈全部再自己加也不行，
-- PostgREST 單次上限 1,000 筆（token_ledger 那支就踩過，第 1,001 筆之後餘額全錯）。

BEGIN;

CREATE OR REPLACE FUNCTION public.point_ledger_sum(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(delta), 0)::integer FROM point_ledger WHERE user_id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.point_ledger_sum(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.point_ledger_sum(uuid) TO service_role, authenticated;

COMMIT;
