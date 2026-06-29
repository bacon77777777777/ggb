-- Add recipient fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS recipient_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS recipient_phone TEXT;

-- Update RLS policies if necessary (assuming existing policies cover updates)
-- If users table has RLS, we ensure admins can read/write these fields.
-- Usually policies are on table level, so adding columns is fine.
