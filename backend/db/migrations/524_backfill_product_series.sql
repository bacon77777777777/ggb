-- 524: 補齊商品的 series 欄位（首頁二級頁籤與推薦排序的唯一依據）
--
-- 首頁的二級頁籤不是後台設定的，是即時從商品 series 分組算出來的
-- （frontend/app/page.tsx 的 seriesTabs）。一番賞／抽卡／自製賞一件都沒填，
-- 所以那三個分頁只剩一顆「推薦」；沒填的商品在綜合頁的推薦排序也拿 0 分，
-- 會被系統性壓在有系列的商品後面。
--
-- 用商品名比對而非 id —— STG 與 PROD 的 id 不一致（各自匯入）。
-- 沒有明確 IP 的商品（原創動物、壽司、爬蟲類…）刻意留空，
-- 硬掰一個系列只會多一顆沒人點的頁籤。

-- ── 盒玩 ────────────────────────────────────────────────
-- 美樂蒂／酷洛米本來就是三麗鷗旗下，併回母 IP 才不會拆成兩顆頁籤
UPDATE products SET series = '三麗鷗'     WHERE name = '美樂蒂&酷洛米 粉餅盒造型擺飾';
UPDATE products SET series = 'LULU豬'     WHERE name = 'LULU豬 美食探索家';
UPDATE products SET series = '間諜家家酒' WHERE name = '《間諜家家酒》安妮亞驚喜黏土人';

-- ── 抽卡（clove oripa，獎項全是寶可夢 PSA 卡與未開封盒）────
UPDATE products SET series = '寶可夢' WHERE name IN (
  '4周年 流星ガチャ', '4周年 アド確 A1', '4周年 にぶいち B2', '花火演出ガチャ 低単価'
);

-- ── 自製賞 ──────────────────────────────────────────────
UPDATE products SET series = '獵人'         WHERE name = 'HUNTER×HUNTER GREED ISLAND ②';
UPDATE products SET series = '七龍珠'       WHERE name = '七龍珠GT';
UPDATE products SET series = '勝利女神妮姬' WHERE name = '《勝利女神：妮姬》CHAPTER8';
UPDATE products SET series = '寶可夢'       WHERE name = 'Pokémon 30th ANNIVERSARY vol.2';

-- ── 一番賞 ──────────────────────────────────────────────
UPDATE products SET series = '我的英雄學院' WHERE name = '《我的英雄學院》-成為最棒英雄之前的故事-';
UPDATE products SET series = '三麗鷗'       WHERE name = '三麗鷗賞《帕恰狗 × 貝克鴨》';
-- 站上既有的 ONE PIECE 商品都叫「航海王」，沿用同一個名字才會併成一顆頁籤
UPDATE products SET series = '航海王'       WHERE name = '《海賊王》艾爾帕夫篇GIANT BASH!! Vol.2★';

-- ── 轉蛋 ────────────────────────────────────────────────
UPDATE products SET series = '星之卡比' WHERE name IN (
  '星之卡比PUPUPU FRIENDS公仔收集2', '星之卡比暖暖毛線角色公仔', '星之卡比目印吊飾3'
);
UPDATE products SET series = '機動戰士鋼彈' WHERE name IN (
  '機動戰士鋼彈等待中公仔 鋼彈的場合4',
  '[GBO海外限定色]機動戰士鋼彈 MOBILE SUIT ENSEMBLE SP 第2彈'
);
UPDATE products SET series = '航海王'       WHERE name = 'ONE PI之實 第二十四海戰';
UPDATE products SET series = 'RIBON'        WHERE name = 'RIBON漫畫目印吊飾';
UPDATE products SET series = 'hololive'     WHERE name = 'HOLOLIVE角色吊飾 ORIGIN 1';
UPDATE products SET series = '庫洛魔法使'   WHERE name = 'CAPSULE TORSO庫洛魔法透明卡牌篇迷你包裝系列';
UPDATE products SET series = '超級戰隊'     WHERE name = '第一戰隊五獸者角色吊飾2';
UPDATE products SET series = 'rom&nd'       WHERE name = 'rom＆nd造型吊飾2';
UPDATE products SET series = 'CANMAKE'      WHERE name = 'CANMAKE TOKYO化妝品造型吊飾3';
UPDATE products SET series = '哥吉拉'       WHERE name = '小哥吉拉目印吊飾';
UPDATE products SET series = 'KERORO軍曹'   WHERE name = 'KERORO軍曹包裝吊飾';
UPDATE products SET series = '勝利女神妮姬' WHERE name = '勝利女神妮姬角色吊飾1&2';
UPDATE products SET series = '章魚嗶的原罪' WHERE name = '章魚嗶的原罪目印吊飾';
UPDATE products SET series = '吉伊卡哇'     WHERE name = 'CAPSURIUM 吉伊卡哇場景';

-- 檢查：每個類別補完後有幾顆頁籤、還有幾件沒歸類
SELECT type,
       count(*) AS 上架數,
       count(DISTINCT series) FILTER (WHERE series IS NOT NULL AND series <> '') AS 頁籤數,
       count(*) FILTER (WHERE series IS NULL OR series = '') AS 未歸類
FROM products WHERE status = 'active' GROUP BY type ORDER BY 1;
