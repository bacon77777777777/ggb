-- 555_sell_seller_public_view.sql
--
-- 買家在**下單前**要知道「這位賣家收款是走銀行轉帳還是 LINE Pay」，
-- 才決定自己付不付得了（LINE Pay 個人轉帳需要 LINE Pay Money 帳戶，不是人人都有）。
--
-- 但 `sell_seller_profiles` 整列包含銀行帳號，RLS 也刻意設成「成立訂單後才看得到」。
-- RLS 是列級的，放寬那條政策等於連帳號一起公開。
--
-- 所以開一個**只有方式、沒有帳號**的檢視表。
-- 一般 view 預設 security_invoker = false，會以 view 擁有者身分讀底表、繞過 RLS，
-- 剛好就是這裡要的：公開的只有這三個欄位，帳號永遠讀不到。

BEGIN;

CREATE OR REPLACE VIEW public.sell_seller_public AS
SELECT
  seller_id,
  payout_method,
  (suspended_at IS NOT NULL) AS suspended
FROM public.sell_seller_profiles;

COMMENT ON VIEW public.sell_seller_public IS
  '賣家收款方式（不含帳號）。給買家在下單前判斷付款方式用，刻意不含 transfer_account / linepay_id。';

GRANT SELECT ON public.sell_seller_public TO anon, authenticated;

-- ── 順手關掉已死的商城代收旗標 ──
-- `sell_escrow` 接的是藍新 MPL。2026-08-13 定調玩家商城一律雙方自理，
-- 這個旗標不會再被讀，但留著 true 的話，之後有人加回讀取邏輯會直接踩雷。
UPDATE public.feature_flags SET enabled = false WHERE key = 'sell_escrow';

COMMIT;
