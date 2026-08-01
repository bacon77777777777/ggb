-- 407: 活動頁分類（純後台用，不影響前台呈現）
--
-- 活動頁是通用容器，不只給機台用（未來會有儲值活動、節慶活動、新手指南等）。
-- 活動一多，後台列表會混在一起難找，故加一個分類標籤供後台篩選。

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'other';

COMMENT ON COLUMN public.events.kind IS '後台分類：machine 機台檔期 / campaign 行銷活動 / guide 說明指南 / other 其他';

-- 既有的機台說明頁歸類
UPDATE public.events SET kind = 'machine' WHERE slug IN ('zetcho-rush', '1');
