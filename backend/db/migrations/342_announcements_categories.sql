-- 公告分類簡化：公告→消息、維護→系統，CHECK constraint 更新
ALTER TABLE announcements DROP CONSTRAINT IF EXISTS announcements_category_check;

UPDATE announcements SET category = '消息' WHERE category IN ('公告');
UPDATE announcements SET category = '系統' WHERE category = '維護';

ALTER TABLE announcements
  ADD CONSTRAINT announcements_category_check
  CHECK (category IN ('消息', '活動', '系統'));
