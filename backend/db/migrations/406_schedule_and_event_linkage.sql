-- 406: 檔期（start_at / end_at）與活動關聯骨架
--
-- 設計原則：「檔期」與「上下架」是兩個獨立維度
--   is_active         → 關掉＝前台完全看不到（等同不存在）
--   start_at / end_at → 決定顯示成 未開始 / 進行中 / 已結束（皆可留空＝無限制）
--
-- 已結束時的表現（刻意不一致，因為三者性質不同）：
--   機台   ：卡片仍在，黑遮罩＋白字「機台已結束」，不可進入
--   活動頁 ：頁面仍可開，hero 蓋黑遮罩＋白字「活動已結束」，CTA 禁用
--   輪播圖 ：直接不輪播（過期廣告沒有留著的意義）
--
-- 繼承規則（統一為「自己留空才繼承上層」）：
--   活動頁 → 輪播圖（banners.event_id）
--   活動頁 → 機台主題（slot_themes.event_slug）→ 個別機台（slot_machines.event_slug）
--
-- events 已有 is_active / start_at / end_at，本次僅補其餘三張表。

BEGIN;

-- ── 輪播圖：檔期 + 關聯活動 ──────────────────────────────────────
ALTER TABLE public.banners
  ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS end_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.events(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.banners.start_at IS '檔期開始，留空＝不限制；若留空且有 event_id 則繼承活動檔期';
COMMENT ON COLUMN public.banners.end_at   IS '檔期結束，留空＝不限制；到期後前台不再輪播';
COMMENT ON COLUMN public.banners.event_id IS '關聯活動；設定後由後台自動帶出連結，並可繼承活動檔期';

CREATE INDEX IF NOT EXISTS idx_banners_event_id ON public.banners(event_id);

-- ── 機台主題：檔期（同主題機台共用一檔）────────────────────────
ALTER TABLE public.slot_themes
  ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS end_at   TIMESTAMPTZ;

COMMENT ON COLUMN public.slot_themes.start_at IS '主題檔期開始，留空＝不限制';
COMMENT ON COLUMN public.slot_themes.end_at   IS '主題檔期結束，留空＝不限制；到期後機台卡顯示「機台已結束」但不自動下架';

-- ── 個別機台：檔期（留空＝跟隨主題）────────────────────────────
ALTER TABLE public.slot_machines
  ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS end_at   TIMESTAMPTZ;

COMMENT ON COLUMN public.slot_machines.start_at IS '機台檔期開始，留空＝跟隨主題';
COMMENT ON COLUMN public.slot_machines.end_at   IS '機台檔期結束，留空＝跟隨主題';

-- ── 檔期判定（單一真實來源，前後台共用）────────────────────────
-- 回傳 upcoming / running / ended，供前台決定顯示樣式
CREATE OR REPLACE FUNCTION public.schedule_state(p_start TIMESTAMPTZ, p_end TIMESTAMPTZ)
 RETURNS TEXT
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p_start IS NOT NULL AND now() < p_start THEN 'upcoming'
    WHEN p_end   IS NOT NULL AND now() > p_end   THEN 'ended'
    ELSE 'running'
  END;
$function$;

COMMIT;
