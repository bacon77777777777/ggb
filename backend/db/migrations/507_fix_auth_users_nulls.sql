-- 507: 修後台會員管理整頁空白（老闆回報）
--
-- 根因：機器人帳號是外部腳本直接 SQL 寫進 auth.users 的，
-- confirmation_token / recovery_token / email_change_token_new /
-- email_change 留了 NULL —— GoTrue 的 listUsers 用 Go 的 string 掃描，
-- 掃到 NULL 直接回「Database error finding users」，後台
-- /api/admin/users 整支 500，會員列表與統計卡全空。
-- GoTrue 自己建的帳號這些欄位都是空字串，補齊即可。
UPDATE auth.users SET
  confirmation_token         = COALESCE(confirmation_token, ''),
  recovery_token             = COALESCE(recovery_token, ''),
  email_change_token_new     = COALESCE(email_change_token_new, ''),
  email_change               = COALESCE(email_change, ''),
  phone_change               = COALESCE(phone_change, ''),
  phone_change_token         = COALESCE(phone_change_token, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  reauthentication_token     = COALESCE(reauthentication_token, '')
WHERE confirmation_token IS NULL OR recovery_token IS NULL
   OR email_change_token_new IS NULL OR email_change IS NULL
   OR phone_change IS NULL OR phone_change_token IS NULL
   OR email_change_token_current IS NULL OR reauthentication_token IS NULL;

-- 順帶：user_event_logs 表存在但 PostgREST schema cache 過期，
-- 後台撈登入 IP 一直拿到「找不到表」。叫它重載。
SELECT pg_notify('pgrst', 'reload schema');
