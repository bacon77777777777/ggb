-- Add nickname column to admins table
ALTER TABLE admins ADD COLUMN IF NOT EXISTS nickname VARCHAR(100);

-- Update existing admins to have a default nickname (optional, using username)
UPDATE admins SET nickname = username WHERE nickname IS NULL;
