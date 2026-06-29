-- Add invite_code to users table and set up generation logic

-- 1. Create function to generate random 6-character alphanumeric code
CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS text AS $$
DECLARE
  chars text[] := '{0,1,2,3,4,5,6,7,8,9,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z}';
  result text := '';
  i integer := 0;
  done bool := false;
  collision_check text;
BEGIN
  -- Loop until unique code is found
  WHILE NOT done LOOP
    result := '';
    FOR i IN 1..6 LOOP
      result := result || chars[1+floor(random()*(array_length(chars, 1)))::integer];
    END LOOP;
    
    -- Check for collision
    SELECT id INTO collision_check FROM public.users WHERE invite_code = result;
    IF collision_check IS NULL THEN
      done := true;
    END IF;
  END LOOP;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Add invite_code column (nullable first)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS invite_code TEXT;

-- 3. Backfill existing users
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.users WHERE invite_code IS NULL LOOP
    UPDATE public.users SET invite_code = public.generate_invite_code() WHERE id = r.id;
  END LOOP;
END $$;

-- 4. Add constraints (Unique and Not Null)
ALTER TABLE public.users ALTER COLUMN invite_code SET NOT NULL;
ALTER TABLE public.users ADD CONSTRAINT users_invite_code_key UNIQUE (invite_code);

-- 5. Update handle_new_user trigger to include invite_code
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name, invite_code)
  VALUES (
    new.id, 
    new.email, 
    new.raw_user_meta_data->>'name',
    public.generate_invite_code()
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
