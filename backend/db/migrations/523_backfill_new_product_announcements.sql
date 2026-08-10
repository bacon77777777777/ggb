-- 523: 把已發出的「今日新品上架」公告內文補成完整清單（老闆：不要只有等 N 項）
--
-- announcement-agent 原本只列前 5 項就寫「…等共 12 項」，玩家看不到自己
-- 想找的那檔。route 已改成全部列出，但已發過的公告靠 source_key 擋重複，
-- 不會自己重寫，這裡把既有那幾則補回去。
--
-- 順帶把標題的數量對齊「當天實際上架且仍在架上的商品數」：
-- 08-10 那則發於下午 2 點，之後又上了 4 檔，原標題寫 12 其實少算。

WITH d AS (
  SELECT id, replace(source_key, 'products:', '')::date AS day
  FROM announcements
  WHERE source_key LIKE 'products:%'
),
agg AS (
  SELECT d.id,
         count(*) AS cnt,
         string_agg(
           '・' || CASE p.type
                     WHEN 'ichiban'  THEN '一番賞'
                     WHEN 'gacha'    THEN '轉蛋'
                     WHEN 'blindbox' THEN '盒玩'
                     WHEN 'card'     THEN '抽卡'
                     WHEN 'custom'   THEN '自製賞'
                     ELSE '商品'
                   END || '｜' || p.name,
           E'\n' ORDER BY p.created_at
         ) AS names
  FROM d
  JOIN products p
    ON p.status = 'active'
   AND p.type <> 'slot'
   AND (p.created_at AT TIME ZONE 'Asia/Taipei')::date = d.day
  GROUP BY d.id
)
UPDATE announcements a
SET title   = '今日新品上架 ' || agg.cnt || ' 項',
    content = '今天有 ' || agg.cnt || ' 項新商品上架：' || E'\n\n' || agg.names
FROM agg
WHERE a.id = agg.id;

SELECT title, left(content, 60) || '…' AS preview, source_key
FROM announcements WHERE source_key LIKE 'products:%' ORDER BY source_key;
