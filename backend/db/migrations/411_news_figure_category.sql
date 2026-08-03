-- 411: 文章新增「公仔景品」分類並回填
--
-- 問題：news-agent 的分類選項只有 ichiban/gacha/blindbox/tcg/general，
--       沒有「公仔景品」這一類。但來源多為日本模型玩具媒體，大量文章是
--       SEGA 景品、S.H.Figuarts、ROBOT魂、Hasegawa 模型等 —— 沒有正確的桶可放，
--       只能全部掉進 general。結果 general 佔 465 篇中的 266 篇（57%），
--       而一番賞/盒玩/卡牌頁籤幾乎空著。
--
-- 修補：新增 figure 分類（程式端 prompt 與前台頁籤已同步），
--       並把既有 general 中可明確判定為公仔/景品/模型者回填為 figure。
--       關鍵字取自實際標題樣本，未命中者維持 general。

UPDATE public.news
SET category = 'figure'
WHERE category = 'general'
  AND (title || ' ' || COALESCE(summary, '')) ~*
      '景品|プライズ|SEGA|セガ|フィギュア|公仔|手辦|模型|Figuarts|ROBOT魂|Lucrea|スケール|1/7|1/8|ねんどろいど|黏土人';

-- 少數 general 實為轉蛋文，一併歸位
UPDATE public.news
SET category = 'gacha'
WHERE category = 'general'
  AND (title || ' ' || COALESCE(summary, '')) ~* '轉蛋|扭蛋|ガシャポン|ガチャ|capsule';
