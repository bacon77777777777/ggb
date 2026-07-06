-- execute_readonly_sql: GB哥 / cron 專用唯讀 SQL 執行器
-- 此為線上 Supabase 實際部署版本，以版控作為參考文件。
-- 雙重防護：
--   1. 白名單：只允許 SELECT / WITH 開頭的查詢
--   2. 黑名單：禁止 INSERT/UPDATE/DELETE/DROP/TRUNCATE/ALTER/CREATE/GRANT/REVOKE/EXECUTE/PERFORM

CREATE OR REPLACE FUNCTION public.execute_readonly_sql(query text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
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
$$;

-- 權限：只允許 service_role 呼叫
REVOKE ALL ON FUNCTION public.execute_readonly_sql(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_readonly_sql(text) TO service_role;
