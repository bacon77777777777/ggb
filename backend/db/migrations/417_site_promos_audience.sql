-- 417: 推廣素材的投放對象
--
-- 首頁彈窗的需求是「首次登入後」才跳，但底部警語列要對未登入訪客也看得到
-- （公平性的說服對象本來就是還沒註冊的人）。兩者共用同一張表，
-- 所以把對象做成欄位而不是寫死在元件裡——之後上活動推廣時，
-- 「只給會員看的活動」與「拉新用的公告」也是同一個開關。

ALTER TABLE public.site_promos
  ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'all'
    CHECK (audience IN ('all', 'logged_in', 'logged_out'));

COMMENT ON COLUMN public.site_promos.audience IS
  '投放對象：all=全部｜logged_in=已登入｜logged_out=未登入（拉新用）';

-- 公平性彈窗依需求設為登入後才跳；底部警語列維持 all
UPDATE public.site_promos
   SET audience = 'logged_in'
 WHERE kind = 'popup' AND cta_href = '/fairness';

-- 警語列文案縮短一行：原文在 390px 寬會斷成兩行，CTA 被擠到第二行看起來像斷開的
UPDATE public.site_promos
   SET body = '每一抽都事先封存、事後可驗算，不是我們說了算。'
 WHERE kind = 'notice' AND cta_href = '/fairness';
