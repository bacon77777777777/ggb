-- 灌籃SLAM DUNK 主題（STG 內容種子，非 schema migration）
--
-- 複製自絕頂RUSH 的玩法參數（保底 200 轉 / 觸發 0.2% / 延續 30% 衰減 0.5 /
-- 返還期望 38.7% → RTP ≈ 82%），僅更換視覺與名稱。
--
-- 機台圖素：後台「sprite 原圖直傳」上傳到 R2 的籃球組圖（2048×1400，與現有模板同規格，
-- 故 machine_layout 留空沿用預設版位）。R2 bucket 為兩環境共用，故同一網址在 STG/PROD 皆可用。
-- ⚠️ 勿改回 /images/slot/machine/sprite2.png —— 那是埃及主題的範例圖，不是本主題的圖素。
--
-- ⚠️ 建立後機台維持「未上架」：RUSH 獎池尚未填入卡片，
--    若直接上架，玩家一轉就會撞到「此檔次獎池已售罄」。獎池補齊後再開。
-- 可重複執行（先刪同名主題再重建）。

BEGIN;

DELETE FROM public.slot_themes WHERE name = '灌籃SLAM DUNK';

INSERT INTO public.slot_themes (
  name, machine_type, machine_sprite_url, machine_layout, image_url,
  machine_count, supplier_id, sort_order, is_active, event_slug,
  bet_tiers, spin_returns,
  trigger_rate, continue_rate, continue_rate_decay, min_rush_hits, floor_spin_count,
  video_rush_entry, video_rush_anticipation, video_rush_win,
  video_rush_win_strong, video_rush_win_god, video_rush_revival
)
SELECT
  '灌籃SLAM DUNK', 'classic',
  'https://pub-c00e655167c141b8bbdbab731167147d.r2.dev/products/slot-sprite-5-1785572357287.png',
  NULL, t.image_url,
  5, t.supplier_id, 2, TRUE, 'slam-dunk',
  t.bet_tiers, t.spin_returns,
  t.trigger_rate, t.continue_rate, t.continue_rate_decay, t.min_rush_hits, t.floor_spin_count,
  NULL, NULL, NULL, NULL, NULL, NULL
FROM public.slot_themes t WHERE t.name = '絕頂RUSH';

-- 五台機台（未上架，等獎池補齊）
INSERT INTO public.slot_machines (
  name, machine_theme, theme_id, machine_number, is_active, sort_order,
  price_per_spin, bet_tiers, spin_returns,
  trigger_rate, continue_rate, continue_rate_decay, min_rush_hits, floor_spin_count,
  supplier_id, event_slug, rush_state, floor_counter, rush_continue_count
)
SELECT
  nt.name, 'slot', nt.id, g.n, FALSE, g.n,
  0, nt.bet_tiers, nt.spin_returns,
  nt.trigger_rate, nt.continue_rate, nt.continue_rate_decay, nt.min_rush_hits, nt.floor_spin_count,
  nt.supplier_id, NULL, 'normal', 0, 0
FROM public.slot_themes nt, generate_series(1, 5) g(n)
WHERE nt.name = '灌籃SLAM DUNK';

-- 返還獎池（純顯示項，無庫存與獎品連結）
INSERT INTO public.slot_pool_items
  (machine_id, display_name, coin_return, return_multiplier, weight, normal_only, rush_only, is_floor)
SELECT m.id, r->>'name', TRUE, (r->>'multiplier')::numeric, (r->>'weight')::int, TRUE, FALSE, FALSE
FROM public.slot_machines m
JOIN public.slot_themes t ON t.id = m.theme_id AND t.name = '灌籃SLAM DUNK',
     jsonb_array_elements(t.spin_returns) r;

COMMIT;
