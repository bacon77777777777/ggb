-- 635: 抽獎公平性頁從活動頁模組移出，改成程式碼裡的常駐頁
--
-- 它不是檔期活動：不會下架、不會換檔，內容是對玩家的公平性承諾，由 FAQ、
-- 服務條款、退換貨與首頁底部警語列指過來。放在 CMS 裡的代價是到處開特例 ——
-- 後端刪除 API 回 403、後台列表隱藏刪除鍵、清全站資料要寫 WHERE slug <> 'fairness'。
-- 三個特例養一頁永遠不會被編輯的內容。
--
-- 內容已原封不動搬進 frontend/app/events/fairness/content.tsx，視覺沿用同一個
-- LpRenderer，網址也還是 /events/fairness（靜態路徑優先於 [slug]）。
-- 三張說明圖也從 R2 搬回本機 /images/fairness/gallery-1~3.webp ——
-- 常駐頁不該依賴 CMS 上傳出來的網址。
--
-- 這裡把 DB 那筆刪掉。event_sections 有 FK CASCADE，會一起走。

DELETE FROM public.events WHERE slug = 'fairness';
