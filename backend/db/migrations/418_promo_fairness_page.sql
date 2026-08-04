-- 418: 公平性推廣素材指向活動頁 + 補上主視覺示意圖
--
-- 原本的 /fairness 是手刻頁面，改用活動頁模組產生（seed_event_fairness.sql），
-- 老闆之後要改文案、換圖都能在後台活動頁管理處理，不用找工程。
-- /fairness 保留為轉址，避免 FAQ、服務條款裡既有的「公平驗證頁面」說法失效。

UPDATE public.site_promos
   SET cta_href  = '/events/fairness',
       image_url = '/images/placeholder/promo_popup.svg'
 WHERE kind = 'popup' AND cta_href = '/fairness';

UPDATE public.site_promos
   SET cta_href = '/events/fairness'
 WHERE kind = 'notice' AND cta_href = '/fairness';
