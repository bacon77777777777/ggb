-- 活動頁改用 linked_category_id（uuid → categories 表），取代舊的 linked_tag 字串
ALTER TABLE events ADD COLUMN IF NOT EXISTS linked_category_id uuid REFERENCES categories(id) ON DELETE SET NULL;

-- 舊 linked_tag 留著不刪（DB backward compat），但前端不再使用
