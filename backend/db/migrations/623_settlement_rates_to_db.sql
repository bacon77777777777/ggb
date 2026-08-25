-- 623: 結算費率從「頁面上手打」改成存 DB（老闆 2026-08-25）
--
-- 為什麼：/reports/settlement 的「費率設定」那四個值（綠界手續費、廠商分潤比、
-- 代扣稅率、積分扣除模式）全部是 useState 硬預設，沒有 localStorage 也沒有 DB ——
-- 重新整理就跳回 2.75 / 70 / 0 / 不計，而且沒有任何地方記得某張對帳單是用幾 % 算的。
-- 月結 cron 還另外寫死一份自己的常數（ECPAY_RATE / SUPPLIER_SHARE），
-- 於是頁面調了 65%、cron 出的快照還是 70%，兩張單子對不起來。
--
-- 語意（老闆指定）：廠商欄位留 NULL ＝ 跟隨全站預設，改全站預設時這些廠商跟著變；
-- 有填值的（手動更動過的）不受影響。表單上把目前的預設值顯示成佔位提示，
-- 讓人看得出空白會套到什麼。
--
-- ⚠️ 綠界手續費估算率**不進廠商欄位**：那是平台跟綠界之間的費率，跟哪家廠商無關，
-- 而且結算已優先採用實際帳算出的混合費率（effectiveFeeRate），這個值只是備援。
-- 放進廠商層級會讓人以為可以跟不同廠商收不同手續費。

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS profit_share_percent     numeric(5,2),
  ADD COLUMN IF NOT EXISTS withholding_rate_percent numeric(5,2),
  ADD COLUMN IF NOT EXISTS points_deduction_mode    text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='suppliers_profit_share_check' AND conrelid='public.suppliers'::regclass) THEN
    ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_profit_share_check
      CHECK (profit_share_percent IS NULL OR (profit_share_percent >= 0 AND profit_share_percent <= 100));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='suppliers_withholding_check' AND conrelid='public.suppliers'::regclass) THEN
    ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_withholding_check
      CHECK (withholding_rate_percent IS NULL OR (withholding_rate_percent >= 0 AND withholding_rate_percent <= 100));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='suppliers_points_mode_check' AND conrelid='public.suppliers'::regclass) THEN
    ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_points_mode_check
      CHECK (points_deduction_mode IS NULL OR points_deduction_mode IN ('A','B'));
  END IF;
END $$;

COMMENT ON COLUMN public.suppliers.profit_share_percent     IS '廠商分潤比 %。NULL＝跟隨全站預設 settlement_supplier_share';
COMMENT ON COLUMN public.suppliers.withholding_rate_percent IS '代扣稅率 %。NULL＝跟隨全站預設 settlement_withholding_rate';
COMMENT ON COLUMN public.suppliers.points_deduction_mode    IS 'A＝積分補償廠商吸收 50%／B＝平台全吸收。NULL＝跟隨全站預設';

-- ── 全站預設 ───────────────────────────────────────────────
-- 值沿用原本寫死在頁面與 cron 裡的那幾個，行為零變化，只是從此可調且查得到
INSERT INTO public.platform_settings (key, value) VALUES
  ('settlement_supplier_share',    '70'),
  ('settlement_withholding_rate',  '0'),
  ('settlement_points_mode',       'B'),
  ('settlement_ecpay_rate',        '2.75')
ON CONFLICT (key) DO NOTHING;
