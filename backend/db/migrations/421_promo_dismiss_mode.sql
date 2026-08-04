-- 421: 關閉後的再出現規則改成三選一
--
-- 原本只有 dismiss_days 一個欄位：0 = 永久關閉、N = N 天後再出現，
-- 表達不了「叉叉只關這一次，下次進首頁照樣彈」這種常見的活動彈窗行為。
--
-- 用 -1 之類的哨兵值塞進「天數」欄位會讓後台介面難解釋（欄位叫天數卻要填 -1），
-- 所以另開 dismiss_mode 明講規則，dismiss_days 只在 mode='days' 時有意義。

ALTER TABLE public.site_promos
  ADD COLUMN IF NOT EXISTS dismiss_mode TEXT NOT NULL DEFAULT 'days'
    CHECK (dismiss_mode IN ('always', 'days', 'never'));

COMMENT ON COLUMN public.site_promos.dismiss_mode IS
  'always=每次進來都彈（關閉只對這次有效）｜days=關閉後 dismiss_days 天再彈｜never=關掉就不再出現';

-- 既有資料沿用原本的語意：0 天等於永久關閉
UPDATE public.site_promos
   SET dismiss_mode = CASE WHEN dismiss_days = 0 THEN 'never' ELSE 'days' END
 WHERE dismiss_mode = 'days' AND dismiss_days = 0;
