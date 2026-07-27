ALTER TABLE events ADD COLUMN IF NOT EXISTS theme_mode text DEFAULT 'dark'
  CHECK (theme_mode IN ('dark', 'light'));
