-- 550: 補回「新增會員時給的初始代幣」漏掉的那一筆分類帳（PROD 專用，老闆核准）
--
-- 2026-08-12 22:42 用後台「新增會員」建立帳號「好吃的油條」時直接帶了 100 萬代幣。
-- 那支 API 當時只 update `users.tokens`，**沒有寫 token_adjustments**，
-- 稽核紀錄的 detail 也只存了姓名與 email，所以：
--
--   帳面餘額 914,048   分類帳合計 −85,952   差額剛好 1,000,000
--
-- 程式已經在同一天修好（新增會員與編輯會員改代幣都會補寫 token_adjustments），
-- 但那只防未來，這筆舊帳要手動補平。
--
-- 這是**補記錄，不是補錢** —— `users.tokens` 一個字都不動，玩家餘額不變。
-- 只是把已經發生的事寫進分類帳，讓財務對帳
-- （expected = recharge + manual − draw − refund）對得起來。
--
-- 只補這一筆：查過同期只有這一個帳號有差額，另外兩個百萬帳號都是 0。

INSERT INTO public.token_adjustments (user_id, delta, reason, created_by, created_at)
SELECT
  '2d4eabbf-0ad9-45bc-a090-aa3441e458fb'::uuid,
  1000000,
  '補記錄：2026-08-12 新增會員時給的初始代幣（當時未寫入分類帳，migration 550 補回）',
  'admin',
  '2026-08-12 22:42:32+08'::timestamptz          -- 對齊當初的稽核紀錄時間，不要記成今天
WHERE NOT EXISTS (
  -- 重跑不會重複補
  SELECT 1 FROM public.token_adjustments
  WHERE user_id = '2d4eabbf-0ad9-45bc-a090-aa3441e458fb'::uuid
    AND delta = 1000000
);
