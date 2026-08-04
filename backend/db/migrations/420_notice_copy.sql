-- 420: 底部警語列改用老闆定版的文案
--
-- 原文「每一抽都事先封存、事後可驗算，不是我們說了算」在 390px 寬會斷成兩行，
-- 且解釋性太強——這條的任務是丟出一個信任訊號並把人帶去說明頁，不是在這裡把機制講完。

UPDATE public.site_promos
   SET body     = '吉吉比使用 HASH 公平可驗證的技術建立，',
       cta_text = '查看說明'
 WHERE kind = 'notice' AND cta_href = '/events/fairness';
