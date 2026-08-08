-- 508: referrals 記錄填碼 IP —— 同 IP 每日填碼上限的依據（防洗保險，
-- 老闆拍板：LINE 帳本是主鎖，這道是免費的第二道）＋後台邀請報表顯示用
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS claim_ip text;
CREATE INDEX IF NOT EXISTS idx_referrals_claim_ip_created
  ON public.referrals (claim_ip, created_at);
