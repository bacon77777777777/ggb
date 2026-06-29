-- Migration: Update Super Admin Credentials (Corrected)
-- Description: Updates the default admin account to 'superadmin' and sets the password to 'superadmin123'

-- 1. Update existing 'admin' user to 'superadmin' if it exists
UPDATE public.admins
SET 
  username = 'superadmin',
  password_hash = 'superadmin123'
WHERE username = 'admin';

-- 2. If 'superadmin' already exists (wasn't just renamed), update its password
UPDATE public.admins
SET 
  password_hash = 'superadmin123'
WHERE username = 'superadmin';

-- 3. Ensure 'superadmin' has the 'super_admin' role
UPDATE public.admins
SET role_id = (SELECT id FROM public.roles WHERE name = 'super_admin')
WHERE username = 'superadmin';
