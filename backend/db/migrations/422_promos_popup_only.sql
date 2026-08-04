-- 422: site_promos 只留首頁彈窗，警語列改為前台寫死
--
-- 底部警語列專為公平性存在，內容與出現規則（未登入每次顯示、
-- 已登入關閉後 7 天）是規則而不是設定值。做成可編輯只會讓人以為
-- 它是通用通知列，之後被拿去放不相干的訊息，反而稀釋掉信任訊號。
-- 規則現在寫在 frontend/components/promo/NoticeBar.tsx。
--
-- 欄位不刪：kind / placements 留著預設值即可，之後若要再開別的
-- 版位（例如商品頁彈窗）就不必再改結構。前台查詢已固定 kind='popup'。

DELETE FROM public.site_promos WHERE kind = 'notice';

ALTER TABLE public.site_promos ALTER COLUMN kind SET DEFAULT 'popup';
ALTER TABLE public.site_promos ALTER COLUMN placements SET DEFAULT ARRAY['home'];

COMMENT ON COLUMN public.site_promos.kind IS
  '目前僅 popup（首頁彈窗）。notice 已改為前台寫死，見 NoticeBar.tsx';
