-- 683: 收件地址簿（2026-09-02，老闆指定最多三筆、可設預設）
--
-- users.recipient_name/recipient_phone/address 保留為「預設地址」的鏡像，
-- 出貨、GB哥、後台等所有既有讀取路徑不用動；前台維護地址簿時同步回寫。
-- 前台用 anon client 直接讀寫，RLS 只放行本人（沒 policy 會靜默回空陣列）。

CREATE TABLE IF NOT EXISTS public.user_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  recipient_name text NOT NULL,
  recipient_phone text NOT NULL,
  address text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_addresses_user ON public.user_addresses(user_id);

ALTER TABLE public.user_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_addresses_select_own ON public.user_addresses;
DROP POLICY IF EXISTS user_addresses_insert_own ON public.user_addresses;
DROP POLICY IF EXISTS user_addresses_update_own ON public.user_addresses;
DROP POLICY IF EXISTS user_addresses_delete_own ON public.user_addresses;
CREATE POLICY user_addresses_select_own ON public.user_addresses FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY user_addresses_insert_own ON public.user_addresses FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_addresses_update_own ON public.user_addresses FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_addresses_delete_own ON public.user_addresses FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_addresses TO authenticated;

-- 最多三筆（前台也擋，這裡是直接打 API 也擋得住的那道）
CREATE OR REPLACE FUNCTION public.enforce_max_user_addresses()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT count(*) FROM public.user_addresses WHERE user_id = NEW.user_id) >= 3 THEN
    RAISE EXCEPTION 'MAX_ADDRESSES';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_max_user_addresses ON public.user_addresses;
CREATE TRIGGER trg_max_user_addresses
  BEFORE INSERT ON public.user_addresses
  FOR EACH ROW EXECUTE FUNCTION public.enforce_max_user_addresses();

-- 單一預設：設成預設時把同人其他筆的預設拿掉
-- （被動更新的那些列 is_default=false，再進 trigger 也不符合 WHEN 條件，不會遞迴）
CREATE OR REPLACE FUNCTION public.ensure_single_default_address()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.user_addresses
  SET is_default = false
  WHERE user_id = NEW.user_id AND id <> NEW.id AND is_default;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_single_default_address ON public.user_addresses;
CREATE TRIGGER trg_single_default_address
  BEFORE INSERT OR UPDATE OF is_default ON public.user_addresses
  FOR EACH ROW WHEN (NEW.is_default) EXECUTE FUNCTION public.ensure_single_default_address();

-- 既有單一地址搬進地址簿當預設（機器人與空資料跳過）
INSERT INTO public.user_addresses (user_id, recipient_name, recipient_phone, address, is_default)
SELECT u.id, u.recipient_name, u.recipient_phone, u.address, true
FROM public.users u
WHERE COALESCE(u.recipient_name, '') <> ''
  AND COALESCE(u.recipient_phone, '') <> ''
  AND COALESCE(u.address, '') <> ''
  AND (u.is_bot IS NULL OR u.is_bot = false)
  AND NOT EXISTS (SELECT 1 FROM public.user_addresses ua WHERE ua.user_id = u.id);
