-- 693: 會員編號改成隨機 8 位數（7 位隨機 + Luhn 檢查碼），邀請碼 = 會員編號
--
-- 老闆 2026-09-04：
--   1. 玩家找客服時要有一個唸得出來、不會改、LINE 帳號也有的識別碼 —— 會員編號。
--      前台之前完全沒顯示它，客服只能靠暱稱猜人。
--   2. 邀請碼跟會員編號合併：同一個人不需要兩個代號。
--   3. 但不要流水號 —— 邀請連結 ?ref=100222 等於公開「你是第 222 個會員」。
--
-- 格式：[1-9] + 6 位隨機 + 1 位 Luhn 檢查碼，共 8 位純數字（例 28417063）。
--   - 純數字：電話上好唸，沒有 0/O、1/I 的混淆（舊邀請碼 XWE72U 就有）
--   - 檢查碼：客服聽錯一位數，格式就對不上，不會查到別人
--   - 900 萬組，一萬個會員時亂猜命中 0.1%
--
-- invite_code 欄位留著（133 個檔案在讀它），值改成 member_no::text，由 trigger 保證同步。
-- referrals 存的是 uuid，不受影響。

BEGIN;

-- Luhn 檢查碼：從 payload 最右一位開始每隔一位加倍（標準 Luhn）
CREATE OR REPLACE FUNCTION public.luhn_check_digit(payload text)
RETURNS integer LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  s int := 0;
  d int;
  i int;
  n int := length(payload);
BEGIN
  FOR i IN 1..n LOOP
    d := substr(payload, n - i + 1, 1)::int;
    IF i % 2 = 1 THEN
      d := d * 2;
      IF d > 9 THEN d := d - 9; END IF;
    END IF;
    s := s + d;
  END LOOP;
  RETURN (10 - (s % 10)) % 10;
END $$;

-- 給程式驗格式用（填邀請碼、後台搜尋）：8 位數、首位非 0、檢查碼對得上
CREATE OR REPLACE FUNCTION public.is_valid_member_no(code text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT code ~ '^[1-9][0-9]{7}$'
     AND public.luhn_check_digit(substr(code, 1, 7)) = substr(code, 8, 1)::int
$$;

CREATE OR REPLACE FUNCTION public.generate_member_no()
RETURNS integer LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  payload text;
  candidate int;
BEGIN
  LOOP
    payload := (1000000 + floor(random() * 9000000))::int::text;      -- 7 位、首位非 0
    candidate := (payload || public.luhn_check_digit(payload)::text)::int;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.users WHERE member_no = candidate OR invite_code = candidate::text
    );
  END LOOP;
  RETURN candidate;
END $$;

-- 流水號序列退場
ALTER TABLE public.users ALTER COLUMN member_no DROP DEFAULT;
DROP SEQUENCE IF EXISTS public.users_member_no_seq;

-- 新帳號：沒帶 member_no（或帶進來的是舊流水號）就配一個；invite_code 一律跟 member_no 走。
-- handle_new_user() 與前台 ensure-profile 還在塞 generate_invite_code()，這裡直接蓋掉。
CREATE OR REPLACE FUNCTION public.assign_member_no()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.member_no IS NULL OR NEW.member_no < 10000000 THEN
    NEW.member_no := public.generate_member_no();
  END IF;
  NEW.invite_code := NEW.member_no::text;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_users_member_no ON public.users;
CREATE TRIGGER trg_users_member_no
  BEFORE INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.assign_member_no();

-- 既有帳號全部重配（含機器人）。逐列 UPDATE 而不是一句 UPDATE：
-- 同一句 UPDATE 裡 generate_member_no() 看不到本句已改的列，撞號會炸 unique。
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.users ORDER BY created_at NULLS LAST, id LOOP
    UPDATE public.users SET member_no = public.generate_member_no() WHERE id = r.id;
  END LOOP;
  UPDATE public.users SET invite_code = member_no::text;
END $$;

COMMENT ON COLUMN public.users.member_no IS
  '會員編號：隨機 8 位數（7 位 + Luhn 檢查碼），同時是邀請碼。給客服、出貨、玩家自己看；uuid 是系統用的。';
COMMENT ON COLUMN public.users.invite_code IS
  '= member_no::text（migration 693 起）。欄位留著是因為前後台很多地方在讀，由 trg_users_member_no 保證同步。';

COMMIT;

-- 驗收
-- SELECT count(*) FILTER (WHERE NOT is_valid_member_no(member_no::text)) AS bad_no,
--        count(*) FILTER (WHERE invite_code <> member_no::text) AS out_of_sync
-- FROM users;
