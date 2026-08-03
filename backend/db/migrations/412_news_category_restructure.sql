-- 412: 文章分類重整 —— 消除空頁籤
--
-- 問題：分類是照「搜尋來源」給的，不是照內容，導致分布極度傾斜。
--   回填 figure 後仍有 general 81 篇（實為周邊商品：T恤、貼紙、食玩、
--   軟膠人偶、TOMICA、WF/MEDICOM 展會），而 blindbox 只有 9 篇，
--   單獨一個頁籤幾乎是空的。
--
-- 決定：把 general 與 blindbox 併為 toy「盒玩周邊」。
--   兩者本質相同（盒裝／盲盒收藏玩具與周邊商品），合併後有 90 篇，
--   且 toy 同時作為 agent 分不出類時的預設值（原本是 general）。
--
-- 最終分類（PROD 篇數）：
--   figure  公仔景品 185 ｜ gacha 轉蛋 106 ｜ toy 盒玩周邊 90
--   ichiban 一番賞    55 ｜ tcg   卡牌   22
-- 每個頁籤都有實際內容，不會出現「此分類目前沒有文章」。

UPDATE public.news SET category = 'toy' WHERE category IN ('general', 'blindbox');
