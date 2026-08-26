-- 630: 會員編號改 6 位起跳（老闆 2026-08-26：「#10042 會不會太少個字？會員突破十萬呢？」）
--
-- 629 從 10001 起，是 5 位數 —— 破 10 萬會員就會變成 6 位，號碼長度跳一級。
-- 位數本身不影響功能（INTEGER 上限 21 億），但編號是要唸給人聽、寫在紙上的東西，
-- 長度忽長忽短會讓人懷疑自己記錯。
--
-- 改成 100001 起：90 萬會員之內都是固定 6 位，比 5 位只多一個字，唸起來一樣順。
-- **現在改零成本（還沒有任何地方在用），上線後改等於全體會員換號。**
--
-- 加 90000 而不是重排：新值最小 100001 > 舊值最大，UNIQUE 不會在更新途中撞號。

UPDATE users SET member_no = member_no + 90000 WHERE member_no < 100000;

SELECT setval('users_member_no_seq', (SELECT COALESCE(MAX(member_no), 100000) + 1 FROM users), false);

COMMENT ON COLUMN users.member_no IS
  '會員編號（給人看的短號，100001 起、6 位）。id 那個 uuid 是系統用的，只在會員詳情頁露出。';
