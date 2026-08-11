-- 529: 下架封面是「來源站 logo」的情報文章（老闆截圖回報）
--
-- 玩具人與 oneone universe 在沒有專屬 og:image 時會回站標，news-agent 照收，
-- 結果文章封面就是一塊紅底白字的 logo。
--
-- route 已加 isUsableCover() 體檢（尺寸 + 色彩多樣度），之後不會再發；
-- 這裡處理已經在架上的。掃描站上最近 60 篇上架文章，三篇中標：
--
--   84269270  161×50   玩具人站標（尺寸過小）
--   45886897  700×700  oneone 站標（32×32 只有 123 色，正常封面 505～1021）
--   33860896  700×700  oneone 站標
--
-- 用下架而不是刪除：文章內文本身是正常的，之後補上圖就能重新上架。

UPDATE news SET is_active = false
WHERE id IN ('84269270', '45886897', '33860896');

SELECT id, left(title, 30) AS title, is_active FROM news
WHERE id IN ('84269270', '45886897', '33860896');
