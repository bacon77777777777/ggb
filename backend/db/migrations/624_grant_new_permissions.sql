-- 624: 新頁面的權限實際發給角色（老闆 2026-08-25 問「管理員權限有跟進嗎」）
--
-- 這幾天新增／改動的四個權限，`npm run check:permissions` 只驗四張表一致，
-- **不會**檢查有沒有任何角色真的拿到 —— 結果是除了 super_admin，沒有人進得去。
--
-- 更要緊的是我把兩個既有頁面的權限換掉了，等於默默拿走了某些人本來有的存取：
--   /small-items  原本吃 products          → 改成 small_items
--   /dismantled   原本吃 reports_dismantled → 改成 recycle_pool
--
-- 實際受影響（PROD 只有 4 個管理員）：
--   elina（accountant）  失去 /dismantled     → 這裡補回來
--   matchplanet（supplier）失去 /small-items  → **刻意不補**：那是平台的機台品項庫，
--                                              廠商本來就不該看到，那正是改權限的原因

-- 會計：回收紀錄與回收商品管理（本來就進得去 /dismantled，維持原狀）
UPDATE public.roles
SET permissions = array(SELECT DISTINCT unnest(permissions || ARRAY['recycle_pool']))
WHERE name = 'accountant';

-- 一般管理員：小物管理（本來靠 products 進得去）＋回收三頁
-- settings_recycle 跟 settings_shipping 同性質（都是影響給玩家的錢的設定），一併給
UPDATE public.roles
SET permissions = array(SELECT DISTINCT unnest(
      permissions || ARRAY['small_items', 'recycle_pool', 'settings_recycle']))
WHERE name = 'admin';

-- 營運：小物管理（本來靠 products 進得去）
UPDATE public.roles
SET permissions = array(SELECT DISTINCT unnest(permissions || ARRAY['small_items']))
WHERE name = 'operator';

-- ⚠️ suppliers_settings（廠商結算設定：分潤比、代扣稅率、差額分潤）**不發給任何角色**，
-- 只有 super_admin 的 {all} 涵蓋得到。那是跟廠商談的錢，比廠商基本資料敏感一個等級。
-- 需要時在後台「管理員權限」逐個勾即可。
