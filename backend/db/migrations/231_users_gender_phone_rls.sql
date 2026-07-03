-- Add missing user profile columns and RLS policies so users can read/update their own row.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone_number text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_phone_verified boolean NOT NULL DEFAULT false;

CREATE POLICY "users_self_select" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users_self_update" ON public.users
  FOR UPDATE USING (auth.uid() = id);
