-- Make email column nullable in admins table
ALTER TABLE admins ALTER COLUMN email DROP NOT NULL;
