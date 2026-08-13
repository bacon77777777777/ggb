-- 551: 補齊 STG 的 action_logs 欄位（PROD 早就有了）
--
-- `lib/logAdminAction.ts` 寫的是 target_type / target_id / detail 這三欄，
-- 但 STG 的 action_logs 只有舊的 target / details（text）。欄位不存在 →
-- insert 失敗 → 那支的 `catch {}` 把錯誤吞掉，**完全不會有人發現**。
--
-- 後果：STG 上所有從 API route 記的後台操作（手動儲值、改權限、上下架、
-- 平台設定…）一筆都沒寫進去。現有的 182 筆全是前端 `addLog()` 那條路徑寫的。
-- 2026-08-13 在做「稽核紀錄詳情改白話」時發現：本機後台（連 STG）找不到
-- 任何一筆帶 detail 的紀錄，回頭比對 schema 才看到差異。
--
-- 這是 schema 漂移，跟 migration 534（user_events 的過期 CHECK）同一類 ——
-- 都是 STG 停在舊版、而且壞掉時不出聲。
--
-- 只加欄位、可為 NULL，既有資料不動。

ALTER TABLE public.action_logs
  ADD COLUMN IF NOT EXISTS target_type text,
  ADD COLUMN IF NOT EXISTS target_id   text,
  ADD COLUMN IF NOT EXISTS detail      jsonb;
