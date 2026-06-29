-- Fix users table schema to match Supabase Auth
-- Run this in Supabase SQL Editor

-- 1. Drop existing table
DROP TABLE IF EXISTS public.users CASCADE;

-- 2. Recreate users table with UUID primary key
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id SERIAL, -- Optional: Keep a numeric ID for internal reference
  name TEXT,
  email TEXT,
  phone TEXT,
  tokens INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  total_draws INTEGER DEFAULT 0,
  total_spent DECIMAL(10, 2) DEFAULT 0,
  address TEXT,
  recipient_name TEXT,
  recipient_phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

-- 3. Create trigger to automatically create public.users entry when auth.users is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'name');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
