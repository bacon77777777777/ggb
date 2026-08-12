-- 537: 新品上架彈窗的總開關
--
-- 首頁彈窗除了後台自己編的公告，再加一種「最新上架」彈窗：
-- 開 → 每次進首頁都跳（不受「關閉後」規則影響，關掉這次、下次照跳）
-- 關 → 完全不顯示
--
-- 放 platform_settings 而不是給 site_promos 加一筆：它的內容是即時從
-- products 撈最新商品組出來的，沒有可編輯的文案或圖片，做成一筆資料
-- 反而要處理「這筆不能編輯」的例外。
--
-- 預設 '0'（關）：功能上線時不該自己開始彈東西給玩家看。

INSERT INTO public.platform_settings (key, value)
VALUES ('promo_new_arrival_enabled', '0')
ON CONFLICT (key) DO NOTHING;
