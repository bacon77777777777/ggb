-- 684: titles／user_titles 的 RLS policy 補齊（2026-09-02）
--
-- 兩張表 RLS 開著卻沒半條 policy，前台設定頁「選擇稱號」用 anon client 讀
-- 永遠拿到空陣列（靜默，不報錯）—— 老闆實測「有領取為啥是空的」就是這個。
-- titles 是公開目錄全放行；user_titles 只放本人讀＋切換選中（發稱號走 service role 不受限）。

DROP POLICY IF EXISTS titles_select_all ON public.titles;
CREATE POLICY titles_select_all ON public.titles FOR SELECT USING (true);

DROP POLICY IF EXISTS user_titles_select_own ON public.user_titles;
CREATE POLICY user_titles_select_own ON public.user_titles FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_titles_update_own ON public.user_titles;
CREATE POLICY user_titles_update_own ON public.user_titles FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT ON public.titles TO anon, authenticated;
GRANT SELECT, UPDATE ON public.user_titles TO authenticated;
