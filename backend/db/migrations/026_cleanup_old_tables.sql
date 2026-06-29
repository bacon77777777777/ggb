-- Backup and cleanup old tables
-- This script creates backup tables and then drops the original deprecated tables.

BEGIN;

-- 1. Backup and Drop draw_history
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'draw_history') THEN
        CREATE TABLE IF NOT EXISTS draw_history_backup AS SELECT * FROM draw_history;
        DROP TABLE draw_history CASCADE;
        RAISE NOTICE 'Backed up and dropped draw_history';
    ELSE
        RAISE NOTICE 'Table draw_history does not exist, skipping';
    END IF;
END $$;

-- 2. Backup and Drop user_inventory
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_inventory') THEN
        CREATE TABLE IF NOT EXISTS user_inventory_backup AS SELECT * FROM user_inventory;
        DROP TABLE user_inventory CASCADE;
        RAISE NOTICE 'Backed up and dropped user_inventory';
    ELSE
        RAISE NOTICE 'Table user_inventory does not exist, skipping';
    END IF;
END $$;

-- 3. Backup and Drop prizes (Old prizes table, replaced by product_prizes)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'prizes') THEN
        CREATE TABLE IF NOT EXISTS prizes_backup AS SELECT * FROM prizes;
        DROP TABLE prizes CASCADE;
        RAISE NOTICE 'Backed up and dropped prizes';
    ELSE
        RAISE NOTICE 'Table prizes does not exist, skipping';
    END IF;
END $$;

-- 4. Backup and Drop profiles (Old profiles table, replaced by users)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
        CREATE TABLE IF NOT EXISTS profiles_backup AS SELECT * FROM profiles;
        DROP TABLE profiles CASCADE;
        RAISE NOTICE 'Backed up and dropped profiles';
    ELSE
        RAISE NOTICE 'Table profiles does not exist, skipping';
    END IF;
END $$;

COMMIT;
