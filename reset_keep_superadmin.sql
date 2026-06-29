BEGIN;

INSERT INTO public.roles (name, display_name, description, permissions)
VALUES ('super_admin', '超級管理員', '擁有系統所有權限', ARRAY['all'])
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.admins (username, password_hash, role_id, status)
SELECT 'superadmin', 'superadmin123', r.id, 'active'
FROM public.roles r
WHERE r.name = 'super_admin'
ON CONFLICT (username) DO NOTHING;

UPDATE public.admins
SET role_id = (SELECT id FROM public.roles WHERE name = 'super_admin'),
    status = 'active'
WHERE username = 'superadmin';

DELETE FROM public.admins
WHERE username <> 'superadmin';

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('admins', 'roles')
  ) LOOP
    EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE;', r.tablename);
  END LOOP;
END $$;

DO $$
BEGIN
  EXECUTE 'TRUNCATE TABLE storage.objects RESTART IDENTITY CASCADE;';
EXCEPTION
  WHEN undefined_table THEN
    NULL;
END $$;

DELETE FROM auth.users;

COMMIT;

