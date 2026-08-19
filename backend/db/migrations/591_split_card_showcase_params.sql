-- 591_split_card_showcase_params.sql
--
-- 商品頁的卡包輪播參數從「蓄力開卡包（card_pack）」搬到獨立的 card_showcase。
--
-- 原因：那組參數（卡包正/背面、自動翻轉、翻轉速度、停手延遲）控制的是
-- **商品頁上半部的卡包輪播**，不是任何一個開包演出。掛在 card_pack 底下的結果是
-- 在「單抽模式」關掉自動旋轉，連卡包模式的商品頁都跟著停（老闆 2026-08-19 回報）。
--
-- 搬移而不是重設：老闆已經設過圖與速度，直接換鍵會讓那些設定憑空消失。

BEGIN;

INSERT INTO public.machine_theme_params (theme, params)
SELECT 'card_showcase', params FROM public.machine_theme_params WHERE theme = 'card_pack'
ON CONFLICT (theme) DO NOTHING;

-- 舊鍵留著不刪：萬一要回頭比對，或有漏改的呼叫端還在讀它

COMMIT;
