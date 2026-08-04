-- 419: 純圖片版彈窗
--
-- 現有彈窗是「圖 + 標題 + 內文 + 按鈕」的卡片版。活動檔期常見的做法是
-- 整張主視覺直接當彈窗（文案已經畫在圖裡），這時多一塊白底卡片反而破壞設計。
--
-- 做成 layout 欄位而不是新增一種 kind：兩者的投放規則（檔期、對象、關閉天數、
-- 出現位置）完全相同，差別只在怎麼畫，用 kind 區分會讓前端多一條重複的查詢分支。
--
-- 純圖片版的 body 不會顯示，改當作圖片替代文字（讀螢幕軟體會念，圖掛掉時也會顯示），
-- 所以 body 的 NOT NULL 維持不動。

ALTER TABLE public.site_promos
  ADD COLUMN IF NOT EXISTS layout TEXT NOT NULL DEFAULT 'card'
    CHECK (layout IN ('card', 'image'));

COMMENT ON COLUMN public.site_promos.layout IS
  'popup 專用：card=圖＋標題＋內文＋按鈕｜image=整張圖點擊即跳轉（body 當替代文字）';
