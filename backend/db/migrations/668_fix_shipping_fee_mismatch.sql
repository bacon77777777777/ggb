-- 668: 修復宅配出貨被 FEE_MISMATCH 卡死
--
-- 症狀（老闆 2026-09-01 回報，只發生在 PROD）：
--   宅配到府按「確認支付」→「運費已更新，請關閉視窗重新申請」，重做幾次都一樣。
--
-- 原因有兩層，都跟「同一條運費公式寫在前台與 DB 兩份」有關：
--
--  ① migration 426 的 INSERT 從來沒有在 PROD 執行過（605 那次 catchup 只補了函式、
--     沒補設定列）。於是 PROD 有會查 `free_shipping_threshold_home` /
--     `shipping_fee_home_large` 的新版 calc_delivery_fee，卻沒有那兩列 ——
--     函式退回舊值（門檻 7、大件價 60），前台則用寫死的預設值（15、120）。
--       一般宅配 ≥7 件：DB 算 0、前台送 60  → 擋
--       含大件（任何件數）：DB 算 60、前台送 120 → 必擋
--     大件會被前台強制切成宅配，所以老闆走的正是這條，且與件數無關。
--
--  ② `platform_settings` 的 public 讀取政策只放行 `shipping\_%` 與「精確等於
--     free_shipping_threshold」。`free_shipping_threshold_cvs` /
--     `free_shipping_threshold_home` 兩個 key **前台從來讀不到**，一直在吃預設值。
--     STG 沒炸只是因為那邊的值剛好等於預設值 —— 只要有人在後台把門檻改掉，
--     STG 也會立刻變成同一個死結。這顆地雷跟 ① 是獨立的，必須一起拆。

-- ── ① 補上 426 漏掉的設定（PROD 缺、STG 已有，ON CONFLICT 讓兩邊都能安全跑）──
INSERT INTO public.platform_settings (key, value) VALUES
  ('free_shipping_threshold_cvs',  '7'),
  ('free_shipping_threshold_home', '15'),
  ('shipping_fee_home_large',      '120')
ON CONFLICT (key) DO NOTHING;

-- ── ② 讓前台讀得到分物流的免運門檻 ──────────────────────────────────────
-- 用 `free_shipping\_%` 涵蓋現有與未來的分物流門檻，不必每加一種物流就改政策一次。
DROP POLICY IF EXISTS "public can read public settings" ON public.platform_settings;
CREATE POLICY "public can read public settings"
  ON public.platform_settings FOR SELECT
  USING (
    key LIKE 'promo\_%'
    OR key LIKE 'shipping\_%'
    OR key LIKE 'sell\_%'
    OR key LIKE 'free\_shipping\_%'
  );
