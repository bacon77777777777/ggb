-- Migration 289: 統一角色 permission key 格式
--
-- 問題：
--   migration 002 的初始角色使用 legacy key（dashboard_view, products_manage 等）
--   permissions 頁面和 PATH_PERMISSION_MAP 已改用新 key（dashboard, products 等）
--   導致 canAccess() 檢查失效 — 有 permissions 的角色看不到對應頁面
--
-- 修正：
--   1. legacy → new key 轉換
--   2. settings → 展開為 settings + settings_features + settings_shipping
--   3. logs → 展開為 logs + dev_logs

DO $$
DECLARE
  r roles%ROWTYPE;
  new_perms text[];
  p text;
BEGIN
  FOR r IN SELECT * FROM roles WHERE name != 'super_admin' LOOP
    new_perms := '{}';

    FOREACH p IN ARRAY COALESCE(r.permissions, '{}') LOOP
      -- 轉換 legacy key
      p := CASE p
        WHEN 'dashboard_view'  THEN 'dashboard'
        WHEN 'products_manage' THEN 'products'
        WHEN 'orders_manage'   THEN 'orders'
        WHEN 'users_manage'    THEN 'users'
        WHEN 'draws_view'      THEN 'draws'
        WHEN 'recharges_view'  THEN 'recharges'
        WHEN 'all'             THEN NULL
        ELSE p
      END;
      IF p IS NOT NULL AND NOT (p = ANY(new_perms)) THEN
        new_perms := array_append(new_perms, p);
      END IF;
    END LOOP;

    -- 有 settings 就補上 settings_features + settings_shipping
    IF 'settings' = ANY(new_perms) THEN
      IF NOT ('settings_features' = ANY(new_perms)) THEN
        new_perms := array_append(new_perms, 'settings_features');
      END IF;
      IF NOT ('settings_shipping' = ANY(new_perms)) THEN
        new_perms := array_append(new_perms, 'settings_shipping');
      END IF;
    END IF;

    -- 有 logs 就補上 dev_logs
    IF 'logs' = ANY(new_perms) AND NOT ('dev_logs' = ANY(new_perms)) THEN
      new_perms := array_append(new_perms, 'dev_logs');
    END IF;

    UPDATE roles SET permissions = new_perms WHERE id = r.id;
  END LOOP;
END $$;
