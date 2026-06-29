-- Fix missing users in public.users table
-- This script backfills public.users from auth.users for any missing records

DO $$
DECLARE
  u RECORD;
  invite_code_exists BOOLEAN;
BEGIN
  -- Check if generate_invite_code function exists, otherwise create a temp one or use random
  -- We assume the schema has the function from previous migrations, but we can just use random for safety in this repair script
  
  FOR u IN 
    SELECT * FROM auth.users 
    WHERE id NOT IN (SELECT id FROM public.users)
  LOOP
    INSERT INTO public.users (id, email, name, invite_code)
    VALUES (
      u.id, 
      u.email, 
      COALESCE(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)),
      substring(md5(random()::text || clock_timestamp()::text) from 1 for 6)
    );
  END LOOP;
END $$;
