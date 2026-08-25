-- 625: 移除 settlement_snapshots 這個孤兒權限（老闆 2026-08-25）
--
-- 「廠商月結管理」那一頁已併進廠商結算頁：狀態徽章、確認結算／標記已付款、
-- 未付款期別清單全部搬過去了，`/settlement-snapshots` 頁面連同它的權限一起撤掉。
--
-- ⚠️ 只撤「權限」，`settlement_snapshots` **資料表保留** ——
-- 那是鎖帳與跨期回收調整的依據（結算頁讀它判斷本期是否已確認／已付款，
-- 跨期調整靠它的 raw_data.rates 回推上期實得率），月結 cron 也還在寫它。
--
-- 確認結算／標記已付款收成 super_admin 專屬（API 端 requireAdminScope 擋），
-- 所以會計不再需要這個權限；留著只會在權限頁列出一個點了沒用的項目。

UPDATE public.roles
SET permissions = array_remove(permissions, 'settlement_snapshots')
WHERE 'settlement_snapshots' = ANY(permissions);
