-- 657_lottery_entry_counts.sql
--
-- 前台列表要顯示每一檔的「已有 N 人登記」，但 lottery_entries 的 RLS 是
-- `auth.uid() = user_id` —— 玩家只讀得到自己那幾筆，直接 count 永遠是 0 或 1。
--
-- 開放讀全表不行：那會把所有參加者的 user_id 攤在前台。
-- 所以走 SECURITY DEFINER，只回「每一檔幾個人」這個數字，不回是誰。
--
-- 一次收一批 id 而不是一檔一支查詢：列表一頁十張卡，逐檔查就是十次來回。

BEGIN;

CREATE OR REPLACE FUNCTION public.get_lottery_entry_counts(p_event_ids bigint[])
RETURNS TABLE (event_id bigint, entries integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT le.event_id, count(*)::integer
  FROM lottery_entries le
  JOIN lottery_events e ON e.id = le.event_id
  WHERE le.event_id = ANY(p_event_ids)
    -- 只回已發布檔期的數字：草稿的登記數不該被外面看到
    AND e.status = 'published'
    AND le.status <> 'refunded'
  GROUP BY le.event_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_lottery_entry_counts(bigint[]) TO anon, authenticated, service_role;

COMMIT;
