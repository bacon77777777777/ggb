-- 593_prize_display_mode.sql
--
-- 品項多一個「展示方式」欄位（老闆 2026-08-19）：一般靜態圖 / 360° 立體展示，**預設一般靜態**。
--
-- 原本是「卡包模式一律用 360°」，等於整檔商品綁死。實際上同一檔裡不是每個品項
-- 都值得 3D 展示 —— 大賞卡值得轉，一般卡看靜態圖就好，而且 3D 要載 three.js。
--
-- ⚠️ 兩道必做檢查（前面各踩過一次）：
--    1. product_prizes 對 anon 是逐欄位授權 → 新欄位一定要 GRANT，
--       否則前台 select 到它會整筆 42501，變成「找不到商品」
--    2. 要加進前台的 PRIZE_PUBLIC_COLUMNS，漏了會靜默拿不到值

BEGIN;

ALTER TABLE public.product_prizes ADD COLUMN IF NOT EXISTS display_mode text NOT NULL DEFAULT 'static';

ALTER TABLE public.product_prizes DROP CONSTRAINT IF EXISTS product_prizes_display_mode_check;
ALTER TABLE public.product_prizes ADD CONSTRAINT product_prizes_display_mode_check
  CHECK (display_mode IN ('static', 'showcase3d'));

COMMENT ON COLUMN public.product_prizes.display_mode IS
  '品項詳情的圖區塊呈現方式：static 一般靜態圖（預設）｜showcase3d 360° 立體展示';

GRANT SELECT (display_mode) ON public.product_prizes TO anon;
GRANT SELECT (display_mode) ON public.product_prizes TO authenticated;

COMMIT;
