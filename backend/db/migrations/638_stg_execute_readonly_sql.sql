-- 638：把 execute_readonly_sql 補到 STG（老闆 2026-08-28 稽核推播時發現）
--
-- 這個函數只存在於 PROD。STG 少了它，所有走 RPC 查資料的 agent
-- （CFO／CMO／供應鏈／健康監測／風控掃描／GB哥）在 STG 全部拿到 null，
-- 也就是「跑起來像正常、但報告永遠是空的」。後台設定頁要顯示推播時間
-- （現查 cron.job）同樣需要它。定義取自 PROD，兩邊完全一致。

CREATE OR REPLACE FUNCTION public.execute_readonly_sql(query text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  result json;
  normalized text;
BEGIN
  normalized := lower(regexp_replace(trim(query), '\s+', ' ', 'g'));
  IF NOT (normalized LIKE 'select %' OR normalized LIKE 'with %') THEN
    RAISE EXCEPTION '只允許 SELECT / WITH 查詢';
  END IF;
  -- Block any write keywords even inside CTEs
  IF normalized ~ '\m(insert|update|delete|drop|truncate|alter|create|grant|revoke|execute|perform)\M' THEN
    RAISE EXCEPTION '查詢包含不允許的關鍵字';
  END IF;
  EXECUTE format('SELECT json_agg(row_to_json(t)) FROM (%s) t', query) INTO result;
  RETURN COALESCE(result, '[]'::json);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.execute_readonly_sql(text) TO service_role;
