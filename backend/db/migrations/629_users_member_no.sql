-- 629: 會員編號（老闆 2026-08-26：「使用者ID 太長，管理員難記憶」）
--
-- users.id 是 Supabase Auth 的 uuid，不能動 —— 改了登入就壞。
-- 所以另外給一個給人用的流水號：uuid 留給系統，人只看 #10042。
--
-- 為什麼不用現成的 invite_code：那是邀請碼，玩家會分享出去，
-- 語意跟「會員編號」不同，而且 6-8 碼英數一樣難唸難記。

CREATE SEQUENCE IF NOT EXISTS users_member_no_seq START WITH 10001;

ALTER TABLE users ADD COLUMN IF NOT EXISTS member_no INTEGER;

-- 既有帳號照註冊時間補號，讓編號順序跟入站順序一致（早註冊的號碼小）。
-- 機器人也編 —— 跳號比「同一張表兩套規則」好維護，反正前台不顯示。
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE member_no IS NULL) THEN
    WITH ordered AS (
      SELECT id, row_number() OVER (ORDER BY created_at NULLS LAST, id) AS rn
      FROM users WHERE member_no IS NULL
    )
    UPDATE users u
       SET member_no = 10000 + o.rn
      FROM ordered o
     WHERE u.id = o.id;

    -- 序號接在已補的號碼之後，新註冊才不會撞號
    PERFORM setval('users_member_no_seq', (SELECT COALESCE(MAX(member_no), 10000) + 1 FROM users), false);
  END IF;
END $$;

ALTER TABLE users ALTER COLUMN member_no SET DEFAULT nextval('users_member_no_seq');

-- 補完才加限制，不然既有的 NULL 會擋住
ALTER TABLE users ALTER COLUMN member_no SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_member_no_key'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_member_no_key UNIQUE (member_no);
  END IF;
END $$;

ALTER SEQUENCE users_member_no_seq OWNED BY users.member_no;

COMMENT ON COLUMN users.member_no IS
  '會員編號（給人看的短號，10001 起）。id 那個 uuid 是系統用的，別拿去給客服或出貨人員唸。';
