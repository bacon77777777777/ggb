-- execute_readonly_sql: GB哥 / cron 專用唯讀 SQL 執行器
-- 雙重防護：
--   1. 正規表達式阻擋所有寫入語句（INSERT/UPDATE/DELETE/DDL/DCL）
--   2. SET LOCAL TRANSACTION READ ONLY 確保交易層唯讀
-- 此函式使用 SECURITY DEFINER，請勿賦予一般用戶 EXECUTE 權限。

CREATE OR REPLACE FUNCTION execute_readonly_sql(query TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  -- 阻擋寫入語句（大小寫不分，允許前置空白）
  IF query ~* '^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY|CALL|DO)\b' THEN
    RAISE EXCEPTION 'Write statements are not allowed in execute_readonly_sql';
  END IF;

  -- 交易層唯讀（雙重保護）
  SET LOCAL TRANSACTION READ ONLY;

  -- 執行並將結果聚合為 JSON 陣列
  EXECUTE format('SELECT COALESCE(json_agg(t), ''[]''::json) FROM (%s) t', query)
    INTO result;

  RETURN COALESCE(result, '[]'::JSONB);
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'execute_readonly_sql error: %', SQLERRM;
END;
$$;

-- 權限：只允許 service_role 呼叫
REVOKE ALL ON FUNCTION execute_readonly_sql(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION execute_readonly_sql(TEXT) TO service_role;
