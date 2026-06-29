BEGIN;

-- users: only self read/update (non-sensitive fields), forbid tokens/points updates from client
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin panel anon access" ON public.users;
DROP POLICY IF EXISTS "Public access" ON public.users;
DROP POLICY IF EXISTS users_select_own ON public.users;
DROP POLICY IF EXISTS users_update_own ON public.users;

CREATE POLICY users_select_own
ON public.users
FOR SELECT
USING (id = auth.uid());

CREATE POLICY users_update_own
ON public.users
FOR UPDATE
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

REVOKE INSERT, DELETE ON public.users FROM anon, authenticated;
REVOKE UPDATE ON public.users FROM anon, authenticated;
REVOKE SELECT ON public.users FROM anon;
GRANT SELECT ON public.users TO authenticated;

DO $$
DECLARE
  allowed_cols TEXT[] := ARRAY[]::TEXT[];
  c TEXT;
BEGIN
  FOREACH c IN ARRAY ARRAY['name','recipient_name','recipient_phone','address','phone_number','phone'] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='users' AND column_name=c
    ) THEN
      allowed_cols := array_append(allowed_cols, c);
    END IF;
  END LOOP;

  IF array_length(allowed_cols, 1) IS NOT NULL THEN
    EXECUTE format('GRANT UPDATE (%s) ON public.users TO authenticated;', array_to_string(allowed_cols, ', '));
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users' AND column_name='tokens'
  ) THEN
    EXECUTE 'REVOKE UPDATE (tokens) ON public.users FROM authenticated;';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users' AND column_name='points'
  ) THEN
    EXECUTE 'REVOKE UPDATE (points) ON public.users FROM authenticated;';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users' AND column_name='password'
  ) THEN
    EXECUTE 'REVOKE UPDATE (password) ON public.users FROM authenticated;';
  END IF;
END $$;

-- draw_records (inventory): client select own only
ALTER TABLE IF EXISTS public.draw_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access" ON public.draw_records;
DROP POLICY IF EXISTS draw_records_select_own ON public.draw_records;

CREATE POLICY draw_records_select_own
ON public.draw_records
FOR SELECT
USING (user_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON public.draw_records FROM anon, authenticated;
GRANT SELECT ON public.draw_records TO authenticated;

-- products / product_prizes: public read only
ALTER TABLE IF EXISTS public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.product_prizes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public access" ON public.products;
DROP POLICY IF EXISTS "Enable all access for all users" ON public.products;
DROP POLICY IF EXISTS products_select_all ON public.products;
CREATE POLICY products_select_all ON public.products FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public access" ON public.product_prizes;
DROP POLICY IF EXISTS "Enable all access for all users" ON public.product_prizes;
DROP POLICY IF EXISTS product_prizes_select_all ON public.product_prizes;
CREATE POLICY product_prizes_select_all ON public.product_prizes FOR SELECT USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.products FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.product_prizes FROM anon, authenticated;
GRANT SELECT ON public.products TO anon, authenticated;
GRANT SELECT ON public.product_prizes TO anon, authenticated;

-- orders: client select own only, no direct writes
ALTER TABLE IF EXISTS public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access" ON public.orders;
DROP POLICY IF EXISTS orders_select_own ON public.orders;

CREATE POLICY orders_select_own
ON public.orders
FOR SELECT
USING (user_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON public.orders FROM anon, authenticated;
GRANT SELECT ON public.orders TO authenticated;

-- order_items: allow select when parent order belongs to user
ALTER TABLE IF EXISTS public.order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access" ON public.order_items;
DROP POLICY IF EXISTS order_items_select_own ON public.order_items;

CREATE POLICY order_items_select_own
ON public.order_items
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.user_id = auth.uid()
  )
);

REVOKE INSERT, UPDATE, DELETE ON public.order_items FROM anon, authenticated;
GRANT SELECT ON public.order_items TO authenticated;

-- notifications: client select/update own only (read-state), no direct insert/delete
ALTER TABLE IF EXISTS public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access" ON public.notifications;
DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
DROP POLICY IF EXISTS notifications_update_own ON public.notifications;

CREATE POLICY notifications_select_own
ON public.notifications
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY notifications_update_own
ON public.notifications
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

REVOKE INSERT, DELETE ON public.notifications FROM anon, authenticated;
GRANT SELECT, UPDATE ON public.notifications TO authenticated;

-- recharge_records: client select own only
ALTER TABLE IF EXISTS public.recharge_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access" ON public.recharge_records;
DROP POLICY IF EXISTS recharge_records_select_own ON public.recharge_records;

CREATE POLICY recharge_records_select_own
ON public.recharge_records
FOR SELECT
USING (user_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON public.recharge_records FROM anon, authenticated;
GRANT SELECT ON public.recharge_records TO authenticated;

-- admins / roles / action_logs: forbid client access (admin API uses service role)
ALTER TABLE IF EXISTS public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.action_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.admins FROM anon, authenticated;
REVOKE ALL ON public.roles FROM anon, authenticated;
REVOKE ALL ON public.action_logs FROM anon, authenticated;

COMMIT;

