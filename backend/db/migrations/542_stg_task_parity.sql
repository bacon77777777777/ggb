-- 把 STG 的任務清單對齊 PROD
--
-- 盤查時發現 STG 多出一批 PROD 沒有的任務，而且同一個條件同一個目標會有
-- 兩三筆（抽獎愛好者／抽獎達人／抽獎狂人／課金新星／週間抽獎王／抽獎狂熱），
-- 有些甚至同名重複兩列 —— 那是 STG 的測試殘留，會讓成就頁出現重複項目。
--
-- PROD 是正本。下面這份 (type, title) 白名單就是 PROD 現有的 55 個任務，
-- 不在名單上的一律刪除，再把同名重複收斂成一列。
-- 在 PROD 執行時兩段都不會命中任何列（幂等）。

DELETE FROM tasks t
WHERE NOT EXISTS (
  SELECT 1 FROM (VALUES
  ('achievement','一發入魂'),
  ('achievement','信仰充值'),
  ('achievement','信徒滿天下'),
  ('achievement','停不下來'),
  ('achievement','傳教士'),
  ('achievement','全勤戰士'),
  ('achievement','初心試煉'),
  ('achievement','初次獻祭'),
  ('achievement','初級召集人'),
  ('achievement','命運支配者'),
  ('achievement','命運啟程'),
  ('achievement','命運眷顧'),
  ('achievement','壽星最大'),
  ('achievement','天命之子'),
  ('achievement','小課怡情'),
  ('achievement','常駐居民'),
  ('achievement','抽獎之神'),
  ('achievement','抽獎成癮'),
  ('achievement','排行榜信徒'),
  ('achievement','揪團王'),
  ('achievement','每日供奉'),
  ('achievement','每日修行'),
  ('achievement','永不缺席'),
  ('achievement','火力全開'),
  ('achievement','神明代抽'),
  ('achievement','習慣養成'),
  ('achievement','荷包失守'),
  ('achievement','課長降臨'),
  ('achievement','錢包蒸發'),
  ('achievement','非洲酋長'),
  ('daily','今日首次儲值'),
  ('daily','分享邀請給好友'),
  ('daily','完成1次抽獎'),
  ('daily','完成3次抽獎'),
  ('daily','完成全部每日任務'),
  ('daily','排行榜膜拜1次'),
  ('daily','每日儲值'),
  ('daily','每日分享'),
  ('daily','每日簽到'),
  ('daily','每日連抽'),
  ('daily','消耗20積分'),
  ('daily','瀏覽5個商品'),
  ('weekly','儲值1000代幣'),
  ('weekly','儲值100代幣'),
  ('weekly','儲值500代幣'),
  ('weekly','分享達人'),
  ('weekly','抽獎10次'),
  ('weekly','抽獎20次'),
  ('weekly','抽獎30次'),
  ('weekly','抽獎衝刺'),
  ('weekly','消費100代幣'),
  ('weekly','消費300代幣'),
  ('weekly','社群推廣大使'),
  ('weekly','累積登入5天'),
  ('weekly','邀請 1 位好友')
  ) AS keep(type, title)
  WHERE keep.type = t.type AND keep.title = t.title
);

-- 同名同條件重複的，只留一列
DELETE FROM tasks a USING tasks b
WHERE a.ctid > b.ctid
  AND a.type = b.type AND a.title = b.title
  AND a.condition_type IS NOT DISTINCT FROM b.condition_type
  AND a.target_value  IS NOT DISTINCT FROM b.target_value;

-- STG 另外多一筆條件錯誤的「荷包失守」：condition_type=recharge、target=5，
-- 而正本是 recharge_amount 5000。同名兩列會讓成就頁重複顯示，刪掉錯的那筆。
DELETE FROM tasks WHERE type='achievement' AND title='荷包失守' AND condition_type='recharge';

-- 每週儲值三檔的積分兩邊不一致（STG 600/250/50 vs PROD 450/200/40），
-- 以 PROD 為準。這三檔維持約 10% 回饋，不在本次調價範圍內。
UPDATE tasks SET reward_coins = 450 WHERE type='weekly' AND title='儲值1000代幣';
UPDATE tasks SET reward_coins = 200 WHERE type='weekly' AND title='儲值500代幣';
UPDATE tasks SET reward_coins =  40 WHERE type='weekly' AND title='儲值100代幣';
